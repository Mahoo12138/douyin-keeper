"""抖音 Web DOM 选择器。页面改版只改本文件，Go 不写 XPath。

对照来源（只借鉴，不粘贴）：
- AutoSpark LoginInit：#douyin_login_comp_flat_panel 内 p 切到手机/验证码；#normal-input / #button-input
- keeper：#animate_qrcode_container + 登录文案判断登录层；extract_cookie 只扫码
- sparkflow：创作者中心扫码，无短信切页
创作者中心与消费者站两套都保留，按作业选用。
选择器会过期：登录面板、会话标题、输入框 class 都可能被抖音改掉。
当前消费者站：首页常跳 /jingxuan，不自动出登录层，须点顶栏右侧红色「登录」。
顶栏不是 <header>/<nav>，而是 div.header-ui 里的 button.semi-button-primary。
弹层 #douyin_login_comp_flat_panel：左 #animate_qrcode_container（img 约数秒后才出 data URL），
右 #normal-input（请输入手机号）+ #douyin_login_comp_button_input_id（获取验证码）。
"""

HOME_URL = "https://www.douyin.com/"
CHAT_URL = "https://www.douyin.com/chat"
CREATOR_CHAT_URL = "https://creator.douyin.com/creator-micro/data/following/chat"

LOGIN_PANEL = "#douyin_login_comp_flat_panel"
LOGIN_PANEL_PICTURE = "#douyin_login_comp_flat_panel picture"
QR_CONTAINER = "#animate_qrcode_container"
QR_IMG = "#animate_qrcode_container img, #douyin_login_comp_flat_panel picture img, #douyin_login_comp_flat_panel img, [class*='qrcode'] img, [class*='qr-code'] img"
QR_REFRESH = "#animate_qrcode_container img, #animate_qrcode_container canvas"
SMS_TAB_TEXTS = ("验证码登录", "短信登录", "手机号登录", "手机验证码")
SMS_MODE_TEXTS = ("验证码登录", "验证码")
PWD_LOGIN_TEXT = "密码登录"
LOGIN_OPEN_TEXTS = ("登录 / 注册", "立即登录")
LOGIN_BANNER_TEXTS = ("登录后查看", "登录后即可")
SMS_PANEL_SWITCH = (
    "#douyin_login_comp_flat_panel > div > div:nth-child(2) > div > div:nth-child(4) > p, "
    "#douyin_login_comp_flat_panel > div > div:nth-child(2) > div > div:nth-child(3) > p"
)
LOGIN_IFRAME = "iframe[src*='passport'], iframe[src*='sso'], iframe[src*='login.douyin']"
LOGIN_SCAN_WRAP = "#douyin_login_comp_scan_code"
LOGIN_MOBILE_WRAP = "#douyin_login_comp_mobile_code"
LOGIN_HEADER_SELS = (
    "button.semi-button-primary:has-text('登录')",
    "button.semi-button:has-text('登录')",
    ".header-ui button:has-text('登录')",
    "[class*='header-ui'] button:has-text('登录')",
    "[class*='header-ui'] button.semi-button-primary",
    "header button:has-text('登录')",
    "nav button:has-text('登录')",
    "header a:has-text('登录')",
    "nav a:has-text('登录')",
    "div[role='button']:has-text('登录')",
    "[class*='loginBtn']:has-text('登录')",
    "[class*='login-btn']:has-text('登录')",
)
LOGIN_OPEN_SEL = ", ".join(LOGIN_HEADER_SELS)
LOGIN_HEADER_MAX_Y = 140
LOGIN_HEADER_MIN_X_RATIO = 0.55
CAPTCHA_MSG = "无头浏览器打开抖音遇到验证码墙，无法自动通过。请换有头模式（HUOHUA_PW_HEADLESS=0）、更换出口 IP，或稍后再试。"
SMS_AREA_WRAP = "#douyin_login_comp_normal_input_id"
SMS_AREA_INPUT = "#douyin_login_comp_normal_input_id input"
SMS_PHONE_PLACEHOLDER = "请输入手机号"
SMS_CODE_PLACEHOLDER = "请输入验证码"
SMS_GET_CODE_TEXT = "获取验证码"
SMS_PHONE_INPUT = (
    "#normal-input, "
    "input[placeholder='请输入手机号'], "
    "input[placeholder*='请输入手机号']"
)
SMS_GET_CODE = (
    "#douyin_login_comp_button_input_id span, "
    "#douyin_login_comp_button_input_id, "
    "button:has-text('获取验证码'), "
    "span:has-text('获取验证码')"
)
SMS_CODE_INPUT = (
    "#button-input, "
    "input[placeholder='请输入验证码'], "
    "input[placeholder*='请输入验证码']"
)
SMS_SUBMIT = "#douyin_login_comp_btn_id, #douyin_login_comp_flat_panel button:has-text('登录')"
IDENTITY_TITLE = "身份验证"
IDENTITY_HINT = "为保障账号安全，请先完成身份验证"
IDENTITY_RECV_SMS = "接收短信验证码"
IDENTITY_SEND_SMS = "发送短信验证码"
IDENTITY_TEXTS = ("身份验证", "接收短信验证码", "发送短信验证码", "以确保为本人操作")
IDENTITY_CODE_PLACEHOLDERS = ("请输入验证码", "请输入短信验证码", "短信验证码")
IDENTITY_CODE_INPUT = (
    "input[placeholder*='验证码'], "
    "input[placeholder*='短信验证码'], "
    "input[maxlength='6'][type='tel'], "
    "input[maxlength='6'][type='text'], "
    "input[maxlength='6'][type='number']"
)
IDENTITY_SUBMIT_TEXTS = ("验证", "确定", "完成", "提交", "下一步", "确认")
IDENTITY_ERR_TEXTS = ("验证码错误", "验证码不正确", "验证码已过期", "验证码失效", "请输入正确的验证码", "验证码有误")
CHALLENGE_CAPTCHA_TEXTS = ("图形验证", "滑动验证", "安全验证", "人机验证", "请完成验证")
CHALLENGE_PASSWORD_TEXTS = ("请输入密码", "密码验证", "账号密码")
CHALLENGE_DEVICE_TEXTS = ("换设备", "新设备登录", "设备验证", "确认登录", "是否本人")
CHALLENGE_DEVICE_OK = ("确认是我", "是我本人", "允许登录", "确认登录", "本机登录", "是我")
LOGIN_HINTS = ("扫码登录", "验证码登录", "登录后查看", "登录后即可", "登录后免费畅享")
LOGIN_LAYER_TEXTS = ("扫码登录", "验证码登录", "请输入手机号", "登录后免费畅享高清视频")
LOGIN_LAYER_SELS = (
    LOGIN_PANEL,
    QR_CONTAINER,
    LOGIN_SCAN_WRAP,
    LOGIN_MOBILE_WRAP,
    SMS_PHONE_INPUT,
    SMS_AREA_WRAP,
    "#normal-input",
    "input[placeholder='请输入手机号']",
    "input[placeholder*='请输入手机号']",
)
COOKIE_ACCEPT_TEXTS = (
    "接受全部 Cookie",
    "接受全部",
    "允许全部",
    "同意并继续",
    "同意并进入",
    "进入抖音",
    "进入网站",
    "立即进入",
    "我知道了",
    "Accept All",
    "Accept all",
)
COOKIE_CLOSE_TEXTS = ("关闭",)

CONTACT_TITLE = ".conversationConversationItemtitle"
STREAK_TEXT = ".commonStreaknormalText"
SEARCH_PLACEHOLDER = "搜索"
OPEN_CHAT_TEXT = "发消息"
CONSUMER_EDITOR = 'div[contenteditable="true"]'

CREATOR_FRIENDS_TAB = '[class*="semi-"], #sub-app'
CREATOR_FRIENDS_TAB_TEXT = "好友"
CREATOR_FRIEND_ITEM = '[class*="semi-list-item-body"]'
CREATOR_FRIEND_NAME = '[class*="item-header-name-"]'
CREATOR_EDITOR = '[class*="chat-input-"]'

STICKER_BTN = (
    '[class*="messageMsgInputiconAction"], [class*="componentsemojiemojiPanel"], '
    '[class*="emojiBtn"], [class*="EmojiBtn"], [aria-label*="表情"], [title*="表情"]'
)
STICKER_PANEL = (
    '[class*="emojiEmojisModal"], [class*="emojiPanel"], [class*="stickerPanel"], '
    '[class*="EmojiModal"], [role="dialog"][class*="emoji"]'
)
STICKER_IMG = "img"

RATE_LIMIT_WORDS = (
    "操作过于频繁",
    "操作频繁",
    "操作太频繁",
    "发送过于频繁",
    "请稍后再试",
    "稍后再试",
    "安全验证",
    "滑动验证",
    "验证中心",
    "人机验证",
    "请勿频繁",
    "网络异常",
)
FREQ_WORDS = ("操作过于频繁", "操作频繁", "操作太频繁", "发送过于频繁", "请勿频繁")
CAPTCHA_WORDS = ("安全验证", "滑动验证", "验证中心", "人机验证")
