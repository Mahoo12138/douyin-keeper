type MenuButtonRect = {
  top: number
  left: number
  height: number
}

export type MiniNavbarMetrics = {
  statusBarHeight: number
  rowHeight: number
  capsuleInset: number
}

export function resolveMiniNavbarMetrics(windowWidth: number, statusBarHeight: number, menuButton?: MenuButtonRect | null): MiniNavbarMetrics {
  if (!menuButton || menuButton.left <= 0 || menuButton.height <= 0) {
    return { statusBarHeight: Math.max(0, statusBarHeight), rowHeight: 44, capsuleInset: 16 }
  }

  const verticalGap = Math.max(4, menuButton.top - statusBarHeight)
  return {
    statusBarHeight: Math.max(0, statusBarHeight),
    rowHeight: Math.max(44, menuButton.height + verticalGap * 2),
    capsuleInset: Math.max(16, windowWidth - menuButton.left + 8),
  }
}
