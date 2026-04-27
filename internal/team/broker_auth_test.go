package team

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthSignupCanCreateTeamAndSession(t *testing.T) {
	b := newTestBroker(t)

	rec := httptest.NewRecorder()
	b.handleAuthSignup(rec, jsonRequestForTest(t, "/auth/signup", map[string]string{
		"email":       " Founder@Example.COM ",
		"name":        "Founder",
		"password":    "local-password",
		"team_action": "create",
		"team_name":   "Founding Team",
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("signup status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if cookie := authCookieFromRecorder(rec); cookie == nil || cookie.Value == "" {
		t.Fatalf("signup did not set session cookie: %+v", rec.Result().Cookies())
	}
	var body struct {
		User authUser      `json:"user"`
		Team workspaceTeam `json:"team"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode signup: %v", err)
	}
	if body.User.Email != "founder@example.com" || body.User.Role != "owner" {
		t.Fatalf("unexpected signup user: %+v", body.User)
	}
	if body.Team.Name != "Founding Team" || body.User.TeamID != body.Team.ID {
		t.Fatalf("unexpected signup team/user: team=%+v user=%+v", body.Team, body.User)
	}

	sessionReq := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	sessionReq.AddCookie(authCookieFromRecorder(rec))
	sessionRec := httptest.NewRecorder()
	b.handleAuthSession(sessionRec, sessionReq)
	if sessionRec.Code != http.StatusOK {
		t.Fatalf("session status = %d, want %d: %s", sessionRec.Code, http.StatusOK, sessionRec.Body.String())
	}
	var sessionBody struct {
		Authenticated bool          `json:"authenticated"`
		User          authUser      `json:"user"`
		Team          workspaceTeam `json:"team"`
	}
	if err := json.NewDecoder(sessionRec.Body).Decode(&sessionBody); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if !sessionBody.Authenticated || sessionBody.User.Email != "founder@example.com" || sessionBody.Team.ID != body.Team.ID {
		t.Fatalf("unexpected session body: %+v", sessionBody)
	}
}

func TestAuthSignupCanJoinExistingTeamWithInvite(t *testing.T) {
	b := newTestBroker(t)
	owner := signupForTest(t, b, "owner@example.com", "Owner", "create", "Ops Team", "")

	inviteRec := httptest.NewRecorder()
	b.handleInvites(inviteRec, jsonRequestForTest(t, "/invites", map[string]string{
		"email":      "member@example.com",
		"name":       "Member",
		"created_by": owner.User.ID,
		"base_url":   "https://office.example",
	}))
	if inviteRec.Code != http.StatusOK {
		t.Fatalf("invite status = %d, want %d: %s", inviteRec.Code, http.StatusOK, inviteRec.Body.String())
	}
	var inviteBody struct {
		Invite teamInvite `json:"invite"`
	}
	if err := json.NewDecoder(inviteRec.Body).Decode(&inviteBody); err != nil {
		t.Fatalf("decode invite: %v", err)
	}
	if inviteBody.Invite.TeamID != owner.Team.ID {
		t.Fatalf("invite team_id = %q, want %q", inviteBody.Invite.TeamID, owner.Team.ID)
	}

	member := signupForTest(t, b, "member@example.com", "Member", "join", "", inviteBody.Invite.Token)
	if member.User.TeamID != owner.Team.ID || member.User.Role != "member" {
		t.Fatalf("unexpected joined user: %+v ownerTeam=%+v", member.User, owner.Team)
	}

	reuseRec := httptest.NewRecorder()
	b.handleAuthSignup(reuseRec, jsonRequestForTest(t, "/auth/signup", map[string]string{
		"email":        "second@example.com",
		"name":         "Second",
		"password":     "local-password",
		"team_action":  "join",
		"invite_token": inviteBody.Invite.Token,
	}))
	if reuseRec.Code != http.StatusConflict {
		t.Fatalf("reuse invite signup status = %d, want %d", reuseRec.Code, http.StatusConflict)
	}
}

func TestAuthLoginAndLogout(t *testing.T) {
	b := newTestBroker(t)
	signupForTest(t, b, "login@example.com", "Login User", "create", "Login Team", "")

	loginRec := httptest.NewRecorder()
	b.handleAuthLogin(loginRec, jsonRequestForTest(t, "/auth/login", map[string]string{
		"email":    "login@example.com",
		"password": "local-password",
	}))
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login status = %d, want %d: %s", loginRec.Code, http.StatusOK, loginRec.Body.String())
	}
	cookie := authCookieFromRecorder(loginRec)
	if cookie == nil || cookie.Value == "" {
		t.Fatalf("login did not set session cookie")
	}

	logoutReq := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	logoutReq.AddCookie(cookie)
	logoutRec := httptest.NewRecorder()
	b.handleAuthLogout(logoutRec, logoutReq)
	if logoutRec.Code != http.StatusOK {
		t.Fatalf("logout status = %d, want %d", logoutRec.Code, http.StatusOK)
	}

	sessionReq := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	sessionReq.AddCookie(cookie)
	sessionRec := httptest.NewRecorder()
	b.handleAuthSession(sessionRec, sessionReq)
	if sessionRec.Code != http.StatusOK {
		t.Fatalf("session status = %d, want %d", sessionRec.Code, http.StatusOK)
	}
	if !strings.Contains(sessionRec.Body.String(), `"authenticated":false`) {
		t.Fatalf("session after logout = %s", sessionRec.Body.String())
	}
}

func TestAuthUsersListsAndUpdatesCurrentTeamRoles(t *testing.T) {
	b := newTestBroker(t)
	owner := signupForTest(t, b, "owner@example.com", "Owner", "create", "Ops Team", "")

	inviteRec := httptest.NewRecorder()
	inviteReq := jsonRequestForTest(t, "/invites", map[string]string{
		"email":    "member@example.com",
		"name":     "Member",
		"base_url": "https://office.example",
	})
	inviteReq.AddCookie(owner.Cookie)
	b.handleInvites(inviteRec, inviteReq)
	if inviteRec.Code != http.StatusOK {
		t.Fatalf("invite status = %d, want %d: %s", inviteRec.Code, http.StatusOK, inviteRec.Body.String())
	}
	var inviteBody struct {
		Invite teamInvite `json:"invite"`
	}
	if err := json.NewDecoder(inviteRec.Body).Decode(&inviteBody); err != nil {
		t.Fatalf("decode invite: %v", err)
	}
	member := signupForTest(t, b, "member@example.com", "Member", "join", "", inviteBody.Invite.Token)
	other := signupForTest(t, b, "other@example.com", "Other", "create", "Other Team", "")

	listReq := httptest.NewRequest(http.MethodGet, "/auth/users", nil)
	listReq.AddCookie(owner.Cookie)
	listRec := httptest.NewRecorder()
	b.handleAuthUsers(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list users status = %d, want %d: %s", listRec.Code, http.StatusOK, listRec.Body.String())
	}
	var listBody struct {
		Users []authUser `json:"users"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&listBody); err != nil {
		t.Fatalf("decode users: %v", err)
	}
	if len(listBody.Users) != 2 {
		t.Fatalf("users len = %d, want 2: %+v", len(listBody.Users), listBody.Users)
	}
	for _, user := range listBody.Users {
		if user.TeamID != owner.Team.ID || user.ID == other.User.ID || user.PasswordHash != "" || user.PasswordSalt != "" {
			t.Fatalf("unexpected listed user: %+v other=%+v", user, other.User)
		}
	}

	memberPatchReq := jsonRequestForTest(t, "/auth/users", map[string]string{
		"user_id": owner.User.ID,
		"role":    "admin",
	})
	memberPatchReq.Method = http.MethodPatch
	memberPatchReq.AddCookie(member.Cookie)
	memberPatchRec := httptest.NewRecorder()
	b.handleAuthUsers(memberPatchRec, memberPatchReq)
	if memberPatchRec.Code != http.StatusForbidden {
		t.Fatalf("member role update status = %d, want %d", memberPatchRec.Code, http.StatusForbidden)
	}

	memberInviteReq := jsonRequestForTest(t, "/invites", map[string]string{
		"email":    "newbie@example.com",
		"base_url": "https://office.example",
	})
	memberInviteReq.AddCookie(member.Cookie)
	memberInviteRec := httptest.NewRecorder()
	b.handleInvites(memberInviteRec, memberInviteReq)
	if memberInviteRec.Code != http.StatusForbidden {
		t.Fatalf("member invite status = %d, want %d", memberInviteRec.Code, http.StatusForbidden)
	}

	ownerPatchReq := jsonRequestForTest(t, "/auth/users", map[string]string{
		"user_id": member.User.ID,
		"role":    "admin",
	})
	ownerPatchReq.Method = http.MethodPatch
	ownerPatchReq.AddCookie(owner.Cookie)
	ownerPatchRec := httptest.NewRecorder()
	b.handleAuthUsers(ownerPatchRec, ownerPatchReq)
	if ownerPatchRec.Code != http.StatusOK {
		t.Fatalf("owner role update status = %d, want %d: %s", ownerPatchRec.Code, http.StatusOK, ownerPatchRec.Body.String())
	}
	if got := b.findAuthUserByIDLocked(member.User.ID).Role; got != "admin" {
		t.Fatalf("member role = %q, want admin", got)
	}
}

type signupResult struct {
	User   authUser
	Team   workspaceTeam
	Cookie *http.Cookie
}

func signupForTest(t *testing.T, b *Broker, email, name, action, teamName, inviteToken string) signupResult {
	t.Helper()
	rec := httptest.NewRecorder()
	b.handleAuthSignup(rec, jsonRequestForTest(t, "/auth/signup", map[string]string{
		"email":        email,
		"name":         name,
		"password":     "local-password",
		"team_action":  action,
		"team_name":    teamName,
		"invite_token": inviteToken,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("signup %s status = %d, want %d: %s", email, rec.Code, http.StatusOK, rec.Body.String())
	}
	var body signupResult
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode signup: %v", err)
	}
	body.Cookie = authCookieFromRecorder(rec)
	if body.Cookie == nil {
		t.Fatalf("signup %s did not set auth cookie", email)
	}
	return body
}

func authCookieFromRecorder(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == authSessionCookieName {
			return cookie
		}
	}
	return nil
}
