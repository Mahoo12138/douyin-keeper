"use client"

import { useTheme } from "../hooks/use-theme"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        unstyled: true,
        style: {
          width: '356px',
          minWidth: '356px',
          padding: '16px',
        },
        classNames: {
          toast: 'bg-popover text-popover-foreground border border-border rounded-lg shadow-[0px_4px_12px_rgba(0,0,0,0.1)] flex items-center text-[13px] leading-normal gap-1.5',
          title: 'font-medium leading-[1.5]',
          description: 'text-muted-foreground font-normal leading-[1.4] mt-0.5',
          actionButton: 'bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1.5 rounded text-xs font-medium ml-auto mr-0',
          cancelButton: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1.5 rounded text-xs font-medium',
          closeButton: 'absolute top-0 right-0 h-5 w-5 flex justify-center items-center p-0 bg-popover border border-border rounded-full cursor-pointer z-[1] transition-all duration-100 transform translate-x-[35%] -translate-y-[35%] hover:bg-accent hover:border-accent-foreground/20',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
