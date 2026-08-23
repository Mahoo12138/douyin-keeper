from . import archive, friends, login_qr, login_sms, send_consumer, send_creator, session, stickers

HANDLERS = {
    "login_qr_loop": login_qr.run,
    "login_sms_start": login_sms.start,
    "login_sms_verify": login_sms.verify,
    "session_check": session.check,
    "list_friends": friends.list_friends,
    "harvest_creator_map": friends.harvest_creator,
    "archive_messages": archive.run,
    "list_stickers": stickers.list_stickers,
    "send_sticker": stickers.send_sticker,
    "send_text": send_consumer.send_text,
    "send_first_message_creator": send_creator.send_first,
}
