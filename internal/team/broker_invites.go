package team

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"
)

var errInviteEmailNotConfigured = errors.New("invite email is not configured")

func normalizeInviteEmail(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return ""
	}
	addr, err := mail.ParseAddress(raw)
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(addr.Address))
}

func humanMemberIDForEmail(email string) string {
	local := email
	if at := strings.IndexByte(local, '@'); at >= 0 {
		local = local[:at]
	}
	local = normalizeProjectID(local)
	if local == "" {
		local = "human"
	}
	return "human-" + local
}

func (b *Broker) inviteURLForToken(baseURL, token string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		if env := strings.TrimSpace(os.Getenv("WUPHF_PUBLIC_URL")); env != "" {
			baseURL = strings.TrimRight(env, "/")
		}
	}
	if baseURL == "" {
		baseURL = "http://127.0.0.1:7891"
	}
	return baseURL + "/invite/" + url.PathEscape(token)
}

func inviteMailtoURL(invite teamInvite, inviteURL string) string {
	subject := "You're invited to WUPHF"
	body := fmt.Sprintf("You've been invited to join this WUPHF office.\n\nOpen this link to accept:\n%s\n", inviteURL)
	return "mailto:" + url.PathEscape(invite.Email) + "?subject=" + url.QueryEscape(subject) + "&body=" + url.QueryEscape(body)
}

func withInviteLinks(invite teamInvite, inviteURL string) teamInvite {
	invite.InviteURL = inviteURL
	invite.MailtoURL = inviteMailtoURL(invite, inviteURL)
	return invite
}

func (b *Broker) findInviteByTokenLocked(token string) *teamInvite {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	for i := range b.invites {
		if subtleConstantTimeEqual(b.invites[i].Token, token) {
			return &b.invites[i]
		}
	}
	return nil
}

func subtleConstantTimeEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}

func (b *Broker) handleInvites(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		baseURL := strings.TrimSpace(r.URL.Query().Get("base_url"))
		b.mu.Lock()
		var teamID string
		if user, _, _, ok := b.currentAuthUserLocked(r); ok {
			teamID = user.TeamID
		}
		invites := make([]teamInvite, 0, len(b.invites))
		for _, invite := range b.invites {
			if teamID != "" && invite.TeamID != "" && invite.TeamID != teamID {
				continue
			}
			inviteURL := b.inviteURLForToken(baseURL, invite.Token)
			invites = append(invites, withInviteLinks(invite, inviteURL))
		}
		humans := make([]humanTeamMember, 0, len(b.humanMembers))
		for _, member := range b.humanMembers {
			if teamID != "" && member.TeamID != "" && member.TeamID != teamID {
				continue
			}
			humans = append(humans, member)
		}
		b.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"invites":       invites,
			"human_members": humans,
		})
	case http.MethodPost:
		b.handlePostInvite(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handlePostInvite(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email     string `json:"email"`
		Name      string `json:"name"`
		Role      string `json:"role"`
		Channel   string `json:"channel"`
		CreatedBy string `json:"created_by"`
		BaseURL   string `json:"base_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	email := normalizeInviteEmail(body.Email)
	if email == "" {
		http.Error(w, "valid email required", http.StatusBadRequest)
		return
	}
	createdBy := strings.TrimSpace(body.CreatedBy)
	channel := normalizeChannelSlug(body.Channel)
	now := time.Now().UTC()

	b.mu.Lock()
	var teamID string
	var creatorIsAuthUser bool
	if user, _, _, ok := b.currentAuthUserLocked(r); ok {
		if !canManageAuthRoles(user) {
			b.mu.Unlock()
			http.Error(w, "owner or admin role required", http.StatusForbidden)
			return
		}
		teamID = user.TeamID
		creatorIsAuthUser = true
		if createdBy == "" || createdBy == "human" || createdBy == "you" {
			createdBy = user.ID
		}
	} else if user := b.findAuthUserByIDLocked(createdBy); user != nil {
		teamID = user.TeamID
		creatorIsAuthUser = true
	}
	if createdBy == "" {
		b.mu.Unlock()
		http.Error(w, "created_by required", http.StatusBadRequest)
		return
	}
	if channel != "" {
		if b.findChannelLocked(channel) == nil {
			b.mu.Unlock()
			http.Error(w, "channel not found", http.StatusNotFound)
			return
		}
		if !creatorIsAuthUser && !b.canAccessChannelLocked(createdBy, channel) {
			b.mu.Unlock()
			http.Error(w, "channel access denied", http.StatusForbidden)
			return
		}
	}
	invite := teamInvite{
		ID:        "invite-" + generateToken(),
		TeamID:    teamID,
		Email:     email,
		Name:      strings.TrimSpace(body.Name),
		Role:      strings.TrimSpace(body.Role),
		Channel:   channel,
		Token:     generateToken(),
		Status:    "pending",
		CreatedBy: createdBy,
		CreatedAt: now.Format(time.RFC3339),
		ExpiresAt: now.Add(14 * 24 * time.Hour).Format(time.RFC3339),
	}
	inviteURL := b.inviteURLForToken(body.BaseURL, invite.Token)
	for _, member := range b.humanMembers {
		if member.Email == email && member.Status == "active" {
			b.mu.Unlock()
			http.Error(w, "human member already joined", http.StatusConflict)
			return
		}
	}
	for i := range b.invites {
		if b.invites[i].Email == email && b.invites[i].Status == "pending" {
			b.invites[i].Status = "revoked"
			b.invites[i].SendStatus = "superseded"
		}
	}
	b.invites = append(b.invites, invite)
	b.mu.Unlock()

	sendFn := b.sendInviteEmail
	if sendFn == nil {
		sendFn = defaultSendInviteEmail
	}
	sendErr := sendFn(r.Context(), invite, inviteURL)

	b.mu.Lock()
	stored := b.findInviteByTokenLocked(invite.Token)
	if stored != nil {
		switch {
		case sendErr == nil:
			stored.SentAt = time.Now().UTC().Format(time.RFC3339)
			stored.SendStatus = "sent"
			stored.SendError = ""
		case errors.Is(sendErr, errInviteEmailNotConfigured):
			stored.SendStatus = "not_configured"
			stored.SendError = ""
		default:
			stored.SendStatus = "failed"
			stored.SendError = sendErr.Error()
		}
		invite = *stored
	}
	actionChannel := channel
	if actionChannel == "" {
		actionChannel = "general"
	}
	b.appendActionLocked("human_invited", "office", actionChannel, createdBy, truncateSummary(email, 140), invite.ID)
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"invite":     withInviteLinks(invite, inviteURL),
		"invite_url": inviteURL,
		"email_sent": sendErr == nil,
	})
}

func (b *Broker) handleInviteLookup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	b.mu.Lock()
	invite := b.findInviteByTokenLocked(token)
	if invite == nil {
		b.mu.Unlock()
		http.Error(w, "invite not found", http.StatusNotFound)
		return
	}
	response := *invite
	b.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"invite": response})
}

func (b *Broker) handleInviteAccept(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Token string `json:"token"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	b.mu.Lock()
	defer b.mu.Unlock()
	invite := b.findInviteByTokenLocked(body.Token)
	if invite == nil {
		http.Error(w, "invite not found", http.StatusNotFound)
		return
	}
	if invite.Status != "pending" {
		http.Error(w, "invite already used", http.StatusConflict)
		return
	}
	if invite.ExpiresAt != "" {
		expiresAt, err := time.Parse(time.RFC3339, invite.ExpiresAt)
		if err == nil && now.After(expiresAt) {
			invite.Status = "expired"
			http.Error(w, "invite expired", http.StatusGone)
			return
		}
	}
	if email := normalizeInviteEmail(body.Email); email != "" && email != invite.Email {
		http.Error(w, "email does not match invite", http.StatusForbidden)
		return
	}

	memberID := humanMemberIDForEmail(invite.Email)
	seenID := make(map[string]struct{}, len(b.humanMembers))
	for _, member := range b.humanMembers {
		seenID[member.ID] = struct{}{}
		if member.Email == invite.Email && member.Status == "active" {
			http.Error(w, "human member already joined", http.StatusConflict)
			return
		}
	}
	baseID := memberID
	for i := 2; ; i++ {
		if _, ok := seenID[memberID]; !ok {
			break
		}
		memberID = fmt.Sprintf("%s-%d", baseID, i)
	}

	member := humanTeamMember{
		ID:        memberID,
		TeamID:    invite.TeamID,
		Email:     invite.Email,
		Name:      name,
		Role:      invite.Role,
		Channel:   invite.Channel,
		Status:    "active",
		InviteID:  invite.ID,
		InvitedBy: invite.CreatedBy,
		JoinedAt:  now.Format(time.RFC3339),
	}
	b.humanMembers = append(b.humanMembers, member)
	invite.Status = "accepted"
	invite.AcceptedAt = now.Format(time.RFC3339)
	invite.AcceptedBy = member.ID
	actionChannel := invite.Channel
	if actionChannel == "" {
		actionChannel = "general"
	}
	b.appendActionLocked("human_joined", "office", actionChannel, member.ID, truncateSummary(member.Name+" <"+member.Email+">", 140), member.ID)
	if err := b.saveLocked(); err != nil {
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"member": member, "invite": *invite})
}

func defaultSendInviteEmail(ctx context.Context, invite teamInvite, inviteURL string) error {
	host := strings.TrimSpace(os.Getenv("WUPHF_SMTP_HOST"))
	if host == "" {
		return errInviteEmailNotConfigured
	}
	port := strings.TrimSpace(os.Getenv("WUPHF_SMTP_PORT"))
	if port == "" {
		port = "587"
	}
	from := strings.TrimSpace(os.Getenv("WUPHF_SMTP_FROM"))
	username := strings.TrimSpace(os.Getenv("WUPHF_SMTP_USERNAME"))
	password := strings.TrimSpace(os.Getenv("WUPHF_SMTP_PASSWORD"))
	if from == "" {
		from = username
	}
	if from == "" {
		return errInviteEmailNotConfigured
	}

	subject := "You're invited to WUPHF"
	body := fmt.Sprintf("You've been invited to join a WUPHF office.\n\nAccept your invite:\n%s\n\nThis link expires in 14 days.\n", inviteURL)
	msg := strings.Join([]string{
		"From: " + from,
		"To: " + invite.Email,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	addr := net.JoinHostPort(host, port)
	var auth smtp.Auth
	if username != "" || password != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}
	errCh := make(chan error, 1)
	go func() {
		errCh <- smtp.SendMail(addr, auth, from, []string{invite.Email}, []byte(msg))
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-errCh:
		return err
	}
}
