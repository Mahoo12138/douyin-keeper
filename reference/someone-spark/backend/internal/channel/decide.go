package channel

const (
	Protocol     = "protocol"
	Browser      = "browser"
	CreatorFirst = "creator_first"
)

type Input struct {
	HasConversation   bool
	AllowFirstAccount bool
	AllowFirstFriend  *bool
	PreferProtocol    bool
	SiteProtocol      bool
	Kind              string
}

type Decision struct {
	Channel string
	Code    string
}

func Decide(in Input) Decision {
	if !in.HasConversation {
		allow := in.AllowFirstAccount
		if in.AllowFirstFriend != nil {
			allow = *in.AllowFirstFriend
		}
		if !allow {
			return Decision{Code: "first_message_denied"}
		}
		return Decision{Channel: CreatorFirst}
	}
	if in.Kind == "sticker" {
		return Decision{Channel: Browser}
	}
	if in.PreferProtocol && in.SiteProtocol {
		return Decision{Channel: Protocol}
	}
	return Decision{Channel: Browser}
}

func Confirmed(m map[string]any) bool {
	if m == nil {
		return false
	}
	ok := false
	switch v := m["ok"].(type) {
	case bool:
		ok = v
	case string:
		ok = v == "true" || v == "1"
	}
	if !ok {
		return false
	}
	if id, _ := m["platform_msg_id"].(string); id != "" {
		return true
	}
	switch v := m["confirmed"].(type) {
	case bool:
		return v
	case string:
		return v == "true" || v == "1"
	}
	return false
}
