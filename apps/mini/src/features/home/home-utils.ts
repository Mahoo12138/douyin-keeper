export function createIdempotencyKey() {
  const segment = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')
  const first = segment()
  const second = segment()
  const third = segment()
  const fourth = segment()
  return `${first}-${second.slice(0, 4)}-4${third.slice(1, 4)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${fourth.slice(1, 4)}-${segment()}${segment().slice(0, 4)}`
}
