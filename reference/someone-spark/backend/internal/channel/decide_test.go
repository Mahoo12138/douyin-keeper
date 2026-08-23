package channel

import "testing"

func TestDecideCreator(t *testing.T) {
	d := Decide(Input{HasConversation: false, AllowFirstAccount: true, Kind: "text"})
	if d.Channel != CreatorFirst {
		t.Fatal(d)
	}
}

func TestDecideFirstDenied(t *testing.T) {
	off := false
	d := Decide(Input{HasConversation: false, AllowFirstAccount: true, AllowFirstFriend: &off})
	if d.Code != "first_message_denied" {
		t.Fatal(d)
	}
}

func TestDecideProtocol(t *testing.T) {
	d := Decide(Input{HasConversation: true, PreferProtocol: true, SiteProtocol: true, Kind: "text"})
	if d.Channel != Protocol {
		t.Fatal(d)
	}
}

func TestDecideBrowserWhenProtocolOff(t *testing.T) {
	d := Decide(Input{HasConversation: true, PreferProtocol: false, SiteProtocol: true, Kind: "text"})
	if d.Channel != Browser {
		t.Fatal(d)
	}
}

func TestStickerAlwaysBrowser(t *testing.T) {
	d := Decide(Input{HasConversation: true, PreferProtocol: true, SiteProtocol: true, Kind: "sticker"})
	if d.Channel != Browser {
		t.Fatal(d)
	}
}

func TestConfirmedRequiresID(t *testing.T) {
	if Confirmed(map[string]any{"ok": true}) {
		t.Fatal("只 ok 不能算成功")
	}
	if !Confirmed(map[string]any{"ok": true, "platform_msg_id": "x"}) {
		t.Fatal("应确认")
	}
	if Confirmed(nil) {
		t.Fatal("空")
	}
}
