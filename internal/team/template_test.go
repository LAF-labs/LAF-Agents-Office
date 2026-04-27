package team

import "testing"

func TestParseGeneratedMemberTemplateAppliesDefaults(t *testing.T) {
	tmpl, err := parseGeneratedMemberTemplate(`{"slug":"devrel","name":"Developer Relations","role":"","expertise":[],"personality":"","permission_mode":""}`)
	if err != nil {
		t.Fatalf("parseGeneratedMemberTemplate: %v", err)
	}
	if tmpl.Slug != "devrel" {
		t.Fatalf("unexpected slug: %q", tmpl.Slug)
	}
	if tmpl.Role != "Developer Relations" {
		t.Fatalf("expected role to default to name, got %q", tmpl.Role)
	}
	if len(tmpl.Expertise) == 0 {
		t.Fatal("expected inferred expertise")
	}
	if tmpl.Personality == "" {
		t.Fatal("expected inferred personality")
	}
	if tmpl.PermissionMode != "plan" {
		t.Fatalf("expected default permission mode plan, got %q", tmpl.PermissionMode)
	}
}

func TestParseGeneratedMemberTemplateNormalizesPermissionMode(t *testing.T) {
	tmpl, err := parseGeneratedMemberTemplate(`{"slug":"qa","name":"QA","permission_mode":"root"}`)
	if err != nil {
		t.Fatalf("parseGeneratedMemberTemplate: %v", err)
	}
	if tmpl.PermissionMode != "plan" {
		t.Fatalf("unsafe permission mode should normalize to plan, got %q", tmpl.PermissionMode)
	}
}

func TestParseGeneratedChannelTemplateNormalizesMembers(t *testing.T) {
	tmpl, err := parseGeneratedChannelTemplate(`{"slug":"Launch Room","members":[" PM ","pm","","CEO"]}`)
	if err != nil {
		t.Fatalf("parseGeneratedChannelTemplate: %v", err)
	}
	want := []string{"pm", "ceo"}
	if len(tmpl.Members) != len(want) {
		t.Fatalf("members len: got %#v want %#v", tmpl.Members, want)
	}
	for i := range want {
		if tmpl.Members[i] != want[i] {
			t.Fatalf("member %d: got %#v want %#v", i, tmpl.Members, want)
		}
	}
}
