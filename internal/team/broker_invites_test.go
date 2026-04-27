package team

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHumanInviteEmailsLinkAndAcceptsOnce(t *testing.T) {
	b := newTestBroker(t)
	var sentTo string
	var sentURL string
	b.sendInviteEmail = func(_ context.Context, invite teamInvite, inviteURL string) error {
		sentTo = invite.Email
		sentURL = inviteURL
		return nil
	}

	createRec := httptest.NewRecorder()
	b.handleInvites(createRec, jsonRequestForTest(t, "/invites", map[string]string{
		"email":      " Teammate@Example.COM ",
		"name":       "Kim Teammate",
		"created_by": "human",
		"base_url":   "https://office.example",
	}))
	if createRec.Code != http.StatusOK {
		t.Fatalf("create invite status = %d, want %d: %s", createRec.Code, http.StatusOK, createRec.Body.String())
	}
	var createBody struct {
		Invite    teamInvite `json:"invite"`
		InviteURL string     `json:"invite_url"`
		EmailSent bool       `json:"email_sent"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&createBody); err != nil {
		t.Fatalf("decode create invite: %v", err)
	}
	if createBody.Invite.Email != "teammate@example.com" || createBody.Invite.Status != "pending" {
		t.Fatalf("unexpected invite: %+v", createBody.Invite)
	}
	if createBody.Invite.Token == "" {
		t.Fatalf("create response should include token for local invite link copy")
	}
	if !createBody.EmailSent || sentTo != "teammate@example.com" || !strings.Contains(sentURL, createBody.Invite.Token) {
		t.Fatalf("email send not recorded: email_sent=%v sentTo=%q sentURL=%q token=%q", createBody.EmailSent, sentTo, sentURL, createBody.Invite.Token)
	}
	if createBody.InviteURL != sentURL || !strings.HasPrefix(createBody.InviteURL, "https://office.example/invite/") {
		t.Fatalf("invite_url = %q, sentURL = %q", createBody.InviteURL, sentURL)
	}

	acceptRec := httptest.NewRecorder()
	b.handleInviteAccept(acceptRec, jsonRequestForTest(t, "/invites/accept", map[string]string{
		"token": createBody.Invite.Token,
		"name":  "Kim Teammate",
	}))
	if acceptRec.Code != http.StatusOK {
		t.Fatalf("accept invite status = %d, want %d: %s", acceptRec.Code, http.StatusOK, acceptRec.Body.String())
	}
	var acceptBody struct {
		Member humanTeamMember `json:"member"`
	}
	if err := json.NewDecoder(acceptRec.Body).Decode(&acceptBody); err != nil {
		t.Fatalf("decode accept invite: %v", err)
	}
	if acceptBody.Member.Email != "teammate@example.com" || acceptBody.Member.Name != "Kim Teammate" || acceptBody.Member.Status != "active" {
		t.Fatalf("unexpected accepted member: %+v", acceptBody.Member)
	}

	reuseRec := httptest.NewRecorder()
	b.handleInviteAccept(reuseRec, jsonRequestForTest(t, "/invites/accept", map[string]string{
		"token": createBody.Invite.Token,
		"name":  "Another Name",
	}))
	if reuseRec.Code != http.StatusConflict {
		t.Fatalf("reuse status = %d, want %d", reuseRec.Code, http.StatusConflict)
	}
}

func TestHumanInviteFallsBackToCopyableLinkWhenSMTPIsMissing(t *testing.T) {
	b := newTestBroker(t)

	rec := httptest.NewRecorder()
	b.handleInvites(rec, jsonRequestForTest(t, "/invites", map[string]string{
		"email":      "friend@example.com",
		"created_by": "human",
		"base_url":   "http://127.0.0.1:7891",
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create invite status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Invite    teamInvite `json:"invite"`
		InviteURL string     `json:"invite_url"`
		EmailSent bool       `json:"email_sent"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode invite: %v", err)
	}
	if body.EmailSent {
		t.Fatalf("email_sent = true without SMTP config")
	}
	if body.Invite.SendStatus != "not_configured" {
		t.Fatalf("send status = %q, want not_configured", body.Invite.SendStatus)
	}
	if body.InviteURL == "" || !strings.Contains(body.InviteURL, body.Invite.Token) {
		t.Fatalf("invite url %q does not contain token %q", body.InviteURL, body.Invite.Token)
	}
}

func TestHumanInvitesListFiltersCurrentAuthTeam(t *testing.T) {
	b := newTestBroker(t)
	ownerA := signupForTest(t, b, "owner-a@example.com", "Owner A", "create", "Team A", "")
	ownerB := signupForTest(t, b, "owner-b@example.com", "Owner B", "create", "Team B", "")

	createA := httptest.NewRecorder()
	reqA := jsonRequestForTest(t, "/invites", map[string]string{
		"email":    "a@example.com",
		"base_url": "https://office.example",
	})
	reqA.AddCookie(ownerA.Cookie)
	b.handleInvites(createA, reqA)
	if createA.Code != http.StatusOK {
		t.Fatalf("create A invite status = %d, want %d: %s", createA.Code, http.StatusOK, createA.Body.String())
	}

	createB := httptest.NewRecorder()
	reqB := jsonRequestForTest(t, "/invites", map[string]string{
		"email":    "b@example.com",
		"base_url": "https://office.example",
	})
	reqB.AddCookie(ownerB.Cookie)
	b.handleInvites(createB, reqB)
	if createB.Code != http.StatusOK {
		t.Fatalf("create B invite status = %d, want %d: %s", createB.Code, http.StatusOK, createB.Body.String())
	}

	listRec := httptest.NewRecorder()
	listReq := httptest.NewRequest(http.MethodGet, "/invites?base_url=https://office.example", nil)
	listReq.AddCookie(ownerA.Cookie)
	b.handleInvites(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list invites status = %d, want %d: %s", listRec.Code, http.StatusOK, listRec.Body.String())
	}
	var body struct {
		Invites []teamInvite `json:"invites"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&body); err != nil {
		t.Fatalf("decode list invites: %v", err)
	}
	if len(body.Invites) != 1 || body.Invites[0].Email != "a@example.com" || body.Invites[0].TeamID != ownerA.Team.ID {
		t.Fatalf("unexpected filtered invites: %+v ownerA=%+v", body.Invites, ownerA.Team)
	}
}
