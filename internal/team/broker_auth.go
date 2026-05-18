package team

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/onboarding"
	"golang.org/x/crypto/bcrypt"
)

const authSessionCookieName = "laf_office_session"

// bcryptCost balances login latency vs. brute-force resistance. Cost 12 is
// ~250ms on a modern laptop, well above the bcrypt default of 10 and still
// comfortable for an interactive login. We never store a legacy SHA-256 hash
// for new passwords — see verifyPassword for the migration path.
const bcryptCost = 12

func normalizeTeamSlug(raw string) string {
	slug := normalizeProjectID(raw)
	if slug == "" {
		return "team"
	}
	return slug
}

// hashPassword produces a bcrypt hash for new passwords. Salt is generated
// and embedded by bcrypt itself; callers no longer pass an external salt.
// The legacy SHA-256(salt:password) path lives separately in legacySHA256Hash
// and is only used by verifyPassword during the rolling migration.
func hashPassword(password string) (string, error) {
	if password == "" {
		return "", errors.New("password must not be empty")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// legacySHA256Hash mirrors the original hashing scheme so we can verify and
// migrate existing PasswordHash values written before the bcrypt rollout.
func legacySHA256Hash(password, salt string) string {
	sum := sha256.Sum256([]byte(salt + ":" + password))
	return hex.EncodeToString(sum[:])
}

func isBcryptHash(hash string) bool {
	return strings.HasPrefix(hash, "$2a$") || strings.HasPrefix(hash, "$2b$") || strings.HasPrefix(hash, "$2y$")
}

// verifyPassword returns (ok, needsUpgrade). When ok && needsUpgrade is true,
// the caller must re-hash with hashPassword and persist before responding so
// the legacy SHA-256 hash never survives a successful login.
func verifyPassword(password string, user *authUser) (bool, bool) {
	if user == nil {
		return false, false
	}
	if isBcryptHash(user.PasswordHash) {
		err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
		return err == nil, false
	}
	// Legacy path: SHA-256(salt:password).
	want := legacySHA256Hash(password, user.PasswordSalt)
	if subtle.ConstantTimeCompare([]byte(want), []byte(user.PasswordHash)) != 1 {
		return false, false
	}
	return true, true
}

func publicAuthUser(user authUser) authUser {
	user.PasswordSalt = ""
	user.PasswordHash = ""
	user.AvatarID = normalizeProfileAvatarID(user.AvatarID)
	return user
}

func publicAuthUsers(users []authUser) []authUser {
	out := make([]authUser, 0, len(users))
	for _, user := range users {
		out = append(out, publicAuthUser(user))
	}
	return out
}

func normalizeAuthRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner", "admin", "manager", "member", "viewer":
		return strings.ToLower(strings.TrimSpace(role))
	default:
		return ""
	}
}

const defaultProfileAvatarID = "human"

var profileAvatarIDs = map[string]struct{}{
	"human":    {},
	"ceo":      {},
	"pm":       {},
	"fe":       {},
	"be":       {},
	"designer": {},
	"cmo":      {},
	"cro":      {},
	"qa":       {},
	"content":  {},
}

func normalizeProfileAvatarID(raw string) string {
	id := strings.ToLower(strings.TrimSpace(raw))
	if _, ok := profileAvatarIDs[id]; ok {
		return id
	}
	return defaultProfileAvatarID
}

func canManageAuthRoles(user *authUser) bool {
	if user == nil {
		return false
	}
	return authUserHasPermission(user, permissionMemberManageRoles)
}

func (b *Broker) findAuthUserByEmailLocked(email string) *authUser {
	email = normalizeInviteEmail(email)
	for i := range b.authUsers {
		if b.authUsers[i].Email == email {
			return &b.authUsers[i]
		}
	}
	return nil
}

func (b *Broker) findAuthUserByIDLocked(id string) *authUser {
	id = strings.TrimSpace(id)
	for i := range b.authUsers {
		if b.authUsers[i].ID == id {
			return &b.authUsers[i]
		}
	}
	return nil
}

func (b *Broker) findWorkspaceTeamLocked(id string) *workspaceTeam {
	id = strings.TrimSpace(id)
	for i := range b.workspaceTeams {
		if b.workspaceTeams[i].ID == id {
			return &b.workspaceTeams[i]
		}
	}
	return nil
}

func (b *Broker) firstWorkspaceTeamLocked() *workspaceTeam {
	if len(b.workspaceTeams) == 0 {
		return nil
	}
	return &b.workspaceTeams[0]
}

func (b *Broker) authUsersForTeamLocked(teamID string) []authUser {
	teamID = strings.TrimSpace(teamID)
	users := make([]authUser, 0, len(b.authUsers))
	for _, user := range b.authUsers {
		if user.TeamID == teamID {
			users = append(users, user)
		}
	}
	return users
}

func (b *Broker) ownerCountForTeamLocked(teamID string) int {
	count := 0
	for _, user := range b.authUsers {
		if user.TeamID == teamID && normalizeAuthRole(user.Role) == "owner" && user.Status == "active" {
			count++
		}
	}
	return count
}

func (b *Broker) createWorkspaceTeamLocked(name, createdBy, now string) workspaceTeam {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "My Team"
	}
	slug := normalizeTeamSlug(name)
	id := "team-" + slug
	seen := make(map[string]struct{}, len(b.workspaceTeams))
	for _, team := range b.workspaceTeams {
		seen[team.ID] = struct{}{}
	}
	baseID := id
	for i := 2; ; i++ {
		if _, ok := seen[id]; !ok {
			break
		}
		id = fmt.Sprintf("%s-%d", baseID, i)
	}
	team := workspaceTeam{
		ID:        id,
		Name:      name,
		Slug:      slug,
		CreatedBy: createdBy,
		CreatedAt: now,
		UpdatedAt: now,
	}
	b.workspaceTeams = append(b.workspaceTeams, team)
	return team
}

func (b *Broker) issueAuthSessionLocked(userID string, now time.Time) authSession {
	if b.authSessions == nil {
		b.authSessions = make(map[string]authSession)
	}
	session := authSession{
		Token:     generateToken() + generateToken(),
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(30 * 24 * time.Hour),
	}
	b.authSessions[session.Token] = session
	return session
}

func setAuthSessionCookie(w http.ResponseWriter, session authSession) {
	http.SetCookie(w, &http.Cookie{
		Name:     authSessionCookieName,
		Value:    session.Token,
		Path:     "/",
		Expires:  session.ExpiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearAuthSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     authSessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (b *Broker) currentAuthUserLocked(r *http.Request) (*authUser, *workspaceTeam, authSession, bool) {
	cookie, err := r.Cookie(authSessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return nil, nil, authSession{}, false
	}
	session, ok := b.authSessions[cookie.Value]
	if !ok || time.Now().UTC().After(session.ExpiresAt) {
		return nil, nil, authSession{}, false
	}
	user := b.findAuthUserByIDLocked(session.UserID)
	if user == nil || user.Status != "active" {
		return nil, nil, authSession{}, false
	}
	return user, b.findWorkspaceTeamLocked(user.TeamID), session, true
}

func (b *Broker) requestHasAuthSession(r *http.Request) bool {
	b.mu.Lock()
	_, _, _, ok := b.currentAuthUserLocked(r)
	b.mu.Unlock()
	return ok
}

func (b *Broker) handleTeams(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	teams := append([]workspaceTeam(nil), b.workspaceTeams...)
	b.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"teams": teams})
}

func (b *Broker) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Name     string `json:"name"`
		AvatarID string `json:"avatar_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if len(name) > 80 {
		http.Error(w, "name must be 80 characters or fewer", http.StatusBadRequest)
		return
	}
	avatarID := normalizeProfileAvatarID(body.AvatarID)

	b.mu.Lock()
	user, _, _, ok := b.currentAuthUserLocked(r)
	if !ok {
		b.mu.Unlock()
		http.Error(w, "auth session required", http.StatusUnauthorized)
		return
	}
	user.Name = name
	user.AvatarID = avatarID
	user.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	for i := range b.humanMembers {
		if b.humanMembers[i].UserID == user.ID {
			b.humanMembers[i].Name = name
		}
	}
	updated := publicAuthUser(*user)
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"user": updated})
}

func (b *Broker) handleAuthMePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	currentPassword := strings.TrimSpace(body.CurrentPassword)
	newPassword := strings.TrimSpace(body.NewPassword)
	if currentPassword == "" {
		http.Error(w, "current_password is required", http.StatusBadRequest)
		return
	}
	if len(newPassword) < 8 {
		http.Error(w, "new_password length >= 8 required", http.StatusBadRequest)
		return
	}
	newHash, err := hashPassword(newPassword)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}

	b.mu.Lock()
	user, _, _, ok := b.currentAuthUserLocked(r)
	if !ok {
		b.mu.Unlock()
		http.Error(w, "auth session required", http.StatusUnauthorized)
		return
	}
	okPassword, _ := verifyPassword(currentPassword, user)
	if !okPassword {
		b.mu.Unlock()
		http.Error(w, "current password is incorrect", http.StatusForbidden)
		return
	}
	user.PasswordSalt = ""
	user.PasswordHash = newHash
	user.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (b *Broker) handleAuthUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b.mu.Lock()
		user, _, _, ok := b.currentAuthUserLocked(r)
		if !ok {
			b.mu.Unlock()
			http.Error(w, "auth session required", http.StatusUnauthorized)
			return
		}
		users := publicAuthUsers(b.authUsersForTeamLocked(user.TeamID))
		b.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"users": users})
	case http.MethodPatch:
		var body struct {
			UserID string `json:"user_id"`
			Role   string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		nextRole := normalizeAuthRole(body.Role)
		if nextRole == "" {
			http.Error(w, "role must be owner, admin, manager, member, or viewer", http.StatusBadRequest)
			return
		}
		b.mu.Lock()
		requester, _, _, ok := b.currentAuthUserLocked(r)
		if !ok {
			b.mu.Unlock()
			http.Error(w, "auth session required", http.StatusUnauthorized)
			return
		}
		if !canManageAuthRoles(requester) {
			b.mu.Unlock()
			http.Error(w, "owner or admin role required", http.StatusForbidden)
			return
		}
		target := b.findAuthUserByIDLocked(body.UserID)
		if target == nil || target.TeamID != requester.TeamID {
			b.mu.Unlock()
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		currentRole := normalizeAuthRole(target.Role)
		// Block self-role changes outright. Admins must not be able to self-
		// promote to owner; owners can still be demoted by another owner. This
		// also prevents an owner from accidentally locking themselves out
		// (separately, the last-owner guard below still applies for inter-user
		// demotions).
		if target.ID == requester.ID && nextRole != currentRole {
			b.mu.Unlock()
			http.Error(w, "cannot change your own role", http.StatusForbidden)
			return
		}
		if currentRole == "owner" && nextRole != "owner" && b.ownerCountForTeamLocked(target.TeamID) <= 1 {
			b.mu.Unlock()
			http.Error(w, "cannot remove the last owner", http.StatusConflict)
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		target.Role = nextRole
		target.UpdatedAt = now
		for i := range b.humanMembers {
			if b.humanMembers[i].UserID == target.ID {
				b.humanMembers[i].Role = nextRole
			}
		}
		users := publicAuthUsers(b.authUsersForTeamLocked(requester.TeamID))
		if err := b.saveLocked(); err != nil {
			b.mu.Unlock()
			http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
			return
		}
		updated := publicAuthUser(*target)
		b.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"user":  updated,
			"users": users,
		})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handleAuthSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Email       string `json:"email"`
		Name        string `json:"name"`
		Password    string `json:"password"`
		TeamAction  string `json:"team_action"`
		TeamName    string `json:"team_name"`
		InviteToken string `json:"invite_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	email := normalizeInviteEmail(body.Email)
	name := strings.TrimSpace(body.Name)
	password := strings.TrimSpace(body.Password)
	action := strings.TrimSpace(body.TeamAction)
	if action == "" {
		action = "create"
	}
	if email == "" || name == "" || len(password) < 8 {
		http.Error(w, "email, name, and password length >= 8 required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	nowText := now.Format(time.RFC3339)
	b.mu.Lock()
	defer b.mu.Unlock()
	if action == "create" && len(b.authUsers) == 0 {
		b.resetWorkspaceStateLocked()
		if err := onboarding.Reset(); err != nil {
			http.Error(w, "failed to reset onboarding state", http.StatusInternalServerError)
			return
		}
	}
	if b.findAuthUserByEmailLocked(email) != nil {
		http.Error(w, "user already exists", http.StatusConflict)
		return
	}

	userID := "user-" + generateToken()
	role := "member"
	var team workspaceTeam
	var invite *teamInvite
	switch action {
	case "create":
		team = b.createWorkspaceTeamLocked(body.TeamName, userID, nowText)
		role = "owner"
	case "join":
		invite = b.findInviteByTokenLocked(body.InviteToken)
		if invite == nil {
			http.Error(w, "invite not found", http.StatusNotFound)
			return
		}
		if invite.Status != "pending" {
			http.Error(w, "invite already used", http.StatusConflict)
			return
		}
		if invite.Email != email {
			http.Error(w, "email does not match invite", http.StatusForbidden)
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
		if invite.TeamID != "" {
			found := b.findWorkspaceTeamLocked(invite.TeamID)
			if found == nil {
				http.Error(w, "team not found", http.StatusNotFound)
				return
			}
			team = *found
		} else if first := b.firstWorkspaceTeamLocked(); first != nil {
			team = *first
			invite.TeamID = first.ID
		} else {
			team = b.createWorkspaceTeamLocked("Local Office", "system", nowText)
			invite.TeamID = team.ID
		}
		role = normalizeInviteRole(invite.Role)
	default:
		http.Error(w, "team_action must be create or join", http.StatusBadRequest)
		return
	}

	passwordHash, err := hashPassword(password)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}
	user := authUser{
		ID:           userID,
		Email:        email,
		Name:         name,
		AvatarID:     defaultProfileAvatarID,
		TeamID:       team.ID,
		Role:         role,
		Status:       "active",
		PasswordSalt: "",
		PasswordHash: passwordHash,
		CreatedAt:    nowText,
		UpdatedAt:    nowText,
		LastLoginAt:  nowText,
	}
	b.authUsers = append(b.authUsers, user)
	if invite != nil {
		member := humanTeamMember{
			ID:        humanMemberIDForEmail(email),
			UserID:    user.ID,
			TeamID:    team.ID,
			Email:     email,
			Name:      name,
			Role:      normalizeInviteRole(invite.Role),
			Channel:   invite.Channel,
			Status:    "active",
			InviteID:  invite.ID,
			InvitedBy: invite.CreatedBy,
			JoinedAt:  nowText,
		}
		b.humanMembers = append(b.humanMembers, member)
		invite.Status = "accepted"
		invite.AcceptedAt = nowText
		invite.AcceptedBy = user.ID
	}
	session := b.issueAuthSessionLocked(user.ID, now)
	if err := b.saveLocked(); err != nil {
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	setAuthSessionCookie(w, session)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user": publicAuthUser(user),
		"team": team,
	})
}

func (b *Broker) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	email := normalizeInviteEmail(body.Email)
	password := strings.TrimSpace(body.Password)
	b.mu.Lock()
	defer b.mu.Unlock()
	user := b.findAuthUserByEmailLocked(email)
	if user == nil || user.Status != "active" {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	ok, needsUpgrade := verifyPassword(password, user)
	if !ok {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if needsUpgrade {
		if newHash, err := hashPassword(password); err == nil {
			user.PasswordHash = newHash
			user.PasswordSalt = ""
		}
	}
	now := time.Now().UTC()
	user.LastLoginAt = now.Format(time.RFC3339)
	session := b.issueAuthSessionLocked(user.ID, now)
	team := b.findWorkspaceTeamLocked(user.TeamID)
	if err := b.saveLocked(); err != nil {
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	setAuthSessionCookie(w, session)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user": publicAuthUser(*user),
		"team": team,
	})
}

func (b *Broker) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	if cookie, err := r.Cookie(authSessionCookieName); err == nil {
		delete(b.authSessions, cookie.Value)
		_ = b.saveLocked()
	}
	b.mu.Unlock()
	clearAuthSessionCookie(w)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (b *Broker) handleAuthSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	user, team, _, ok := b.currentAuthUserLocked(r)
	if !ok {
		b.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": false})
		return
	}
	if b.migrateLegacyHomeThreadsForUserLocked(*user) {
		if err := b.saveLocked(); err != nil {
			b.mu.Unlock()
			http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
			return
		}
	}
	publicUser := publicAuthUser(*user)
	var publicTeam *workspaceTeam
	if team != nil {
		teamCopy := *team
		publicTeam = &teamCopy
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"authenticated": true,
		"user":          publicUser,
		"team":          publicTeam,
	})
}
