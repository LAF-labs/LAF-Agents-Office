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

type signupResult struct {
	User authUser
	Team workspaceTeam
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
