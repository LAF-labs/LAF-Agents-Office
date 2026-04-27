package team

import "testing"

func TestMessageComesFromHumanOrSystem(t *testing.T) {
	cases := []channelMessage{
		{From: "you"},
		{From: "human"},
		{From: "automation"},
		{From: "scheduler", Kind: messageKindAutomation},
	}
	for _, msg := range cases {
		if !messageComesFromHumanOrSystem(msg) {
			t.Fatalf("expected %#v to be routed as human/system origin", msg)
		}
	}
	if messageComesFromHumanOrSystem(channelMessage{From: "eng"}) {
		t.Fatalf("specialist message should not be treated as human/system origin")
	}
}

func TestMessageIsStatusOnly(t *testing.T) {
	if !messageIsStatusOnly(channelMessage{Content: "  [STATUS] working"}) {
		t.Fatalf("expected status prefix to be detected")
	}
	if messageIsStatusOnly(channelMessage{Content: "working"}) {
		t.Fatalf("plain content should not be status-only")
	}
}
