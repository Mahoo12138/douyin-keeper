/**
 * Known Issue: Radix UI Hydration Mismatch
 * 
 * DropdownMenu components may cause hydration warnings due to Radix UI
 * generating different IDs on server vs client with React 19.2's useId hook.
 * This is a known upstream issue and does not affect functionality.
 * 
 * @see https://github.com/radix-ui/primitives/issues/3700
 */

import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@libs/react-shared/ui/button";
import { Logo } from "@libs/react-shared/ui/logo";
import { authClientReact } from "@libs/auth/authClient";
import { config } from "@config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu";
import { Check, Globe, ChevronDown, Bot, Crown, Upload, ImageIcon, VideoIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@libs/react-shared/ui/avatar";
import { type SupportedLocale, locales } from "@libs/i18n";
import { useTranslation } from "@/hooks/use-translation";
import { ThemeToggle, ColorSchemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale: currentLocale } = useTranslation();
  
  const { 
    data: session, 
    isPending
  } = authClientReact.useSession();
  const user = session?.user;

  const handleSignOut = async () => {
    await authClientReact.signOut();
    navigate({ to: `/${currentLocale}` });
  };

  const handleLanguageChange = (locale: SupportedLocale) => {
    if (locale === currentLocale) return;
    
    const pathWithoutLocale = location.pathname.replace(`/${currentLocale}`, '') || '/';
    
    document.cookie = `${config.app.i18n.cookieKey}=${locale}; path=/; max-age=31536000`;
    
    window.location.href = `/${locale}${pathWithoutLocale}`;
  };

  return (
    <header className={`w-full bg-background/90 backdrop-blur-sm border-b border-border sticky top-0 z-40 ${className}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and brand */}
          <div className="flex items-center">
            <Link to="/$lang" params={{ lang: currentLocale }}>
              <Logo size="md" />
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex md:items-center md:space-x-8">
            {/* Demos Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  type="button"
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.header.navigation.demos}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-96 p-4">
                <div className="space-y-1">
                  <DropdownMenuItem asChild className="p-0">
                    <a href={`/${currentLocale}/ai`} className="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                        <Bot className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{t.header.demos.ai.title}</span>
                        <span className="text-sm text-muted-foreground leading-snug mt-0.5">
                          {t.header.demos.ai.description}
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="p-0">
                    <a href={`/${currentLocale}/image-generate`} className="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                        <ImageIcon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{t.header.demos.aiImage.title}</span>
                        <span className="text-sm text-muted-foreground leading-snug mt-0.5">
                          {t.header.demos.aiImage.description}
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="p-0">
                    <a href={`/${currentLocale}/video-generate`} className="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                        <VideoIcon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{t.header.demos.aiVideo.title}</span>
                        <span className="text-sm text-muted-foreground leading-snug mt-0.5">
                          {t.header.demos.aiVideo.description}
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="p-0">
                    <a href={`/${currentLocale}/premium-features`} className="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                        <Crown className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{t.header.demos.premium.title}</span>
                        <span className="text-sm text-muted-foreground leading-snug mt-0.5">
                          {t.header.demos.premium.description}
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="p-0">
                    <a href={`/${currentLocale}/upload`} className="group flex items-start gap-4 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary-foreground">
                        <Upload className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{t.header.demos.upload.title}</span>
                        <span className="text-sm text-muted-foreground leading-snug mt-0.5">
                          {t.header.demos.upload.description}
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Link to="/$lang/blog" params={{ lang: currentLocale }} search={{ page: 1 }} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t.header.navigation.blog}
            </Link>
            <Link to="/$lang/pricing" params={{ lang: currentLocale }} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t.header.navigation.pricing}
            </Link>
          </nav>

          {/* User menu or Auth buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Dark Mode Toggle */}
            <ThemeToggle />
            
            {/* Color Scheme Selector */}
            <ColorSchemeToggle />

            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 px-3">
                  <Globe className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">
                    {currentLocale === 'en' ? t.header.language.english : t.header.language.chinese}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {locales.map((locale) => (
                  <DropdownMenuItem
                    key={locale}
                    onClick={() => handleLanguageChange(locale)}
                  >
                    <span>{locale === 'en' ? t.header.language.english : t.header.language.chinese}</span>
                    {currentLocale === locale && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {isPending ? (
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse"></div>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    type="button"
                    className="flex items-center space-x-2 focus:outline-none"
                  >
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarImage src={user.image || ""} alt={user.name || user.email || "User"} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">{user.name || user.email}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium text-foreground">{user.name || "User"}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <a href={`/${currentLocale}/dashboard`} className="flex items-center">
                        <svg className="mr-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        {t.header.userMenu.personalSettings}
                      </a>
                    </DropdownMenuItem>
                    {user.role === 'admin' && (
                      <DropdownMenuItem asChild>
                        <a href={`/${currentLocale}/admin`} className="flex items-center">
                          <svg className="mr-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3v18h18V3H3zm16 16H5V5h14v14z"/>
                            <path d="M8 8h8m-8 4h8m-8 4h5"/>
                          </svg>
                          {t.header.userMenu.adminPanel}
                        </a>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                    <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    {t.header.auth.signOut}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link to="/$lang/signin" params={{ lang: currentLocale }}>
                  <Button variant="ghost" className="text-sm font-medium">
                    {t.header.auth.signIn}
                  </Button>
                </Link>
                <Link to="/$lang/signup" params={{ lang: currentLocale }}>
                  <Button variant="default" className="text-sm font-medium rounded-full">
                    {t.header.auth.getStarted}
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none transition-colors"
            >
              <span className="sr-only">Open main menu</span>
              {!isMenuOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-background border-t border-border">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {/* Demos Section */}
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {t.header.navigation.demos}
              </p>
              <div className="space-y-1">
                <a href={`/${currentLocale}/ai`} className="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="block">{t.header.demos.ai.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.header.demos.ai.description}</span>
                  </div>
                </a>
                <a href={`/${currentLocale}/image-generate`} className="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="block">{t.header.demos.aiImage.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.header.demos.aiImage.description}</span>
                  </div>
                </a>
                <a href={`/${currentLocale}/video-generate`} className="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                  <VideoIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="block">{t.header.demos.aiVideo.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.header.demos.aiVideo.description}</span>
                  </div>
                </a>
                <a href={`/${currentLocale}/premium-features`} className="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                  <Crown className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="block">{t.header.demos.premium.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.header.demos.premium.description}</span>
                  </div>
                </a>
                <a href={`/${currentLocale}/upload`} className="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="block">{t.header.demos.upload.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.header.demos.upload.description}</span>
                  </div>
                </a>
              </div>
            </div>
            <div className="border-t border-border my-2" />
            <Link to="/$lang/blog" params={{ lang: currentLocale }} search={{ page: 1 }} className="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
              {t.header.navigation.blog}
            </Link>
            <Link to="/$lang/pricing" params={{ lang: currentLocale }} className="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
              {t.header.navigation.pricing}
            </Link>
            
            {/* Mobile Theme and Language Controls */}
            <div className="border-t border-border pt-3 mt-3 space-y-2">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium text-foreground">{t.header.mobile.themeSettings}</span>
                <div className="flex items-center space-x-2">
                  <ThemeToggle />
                  <ColorSchemeToggle />
                </div>
              </div>
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{t.header.mobile.languageSelection}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Globe className="mr-2 h-4 w-4" />
                        {currentLocale === 'en' ? t.header.language.english : t.header.language.chinese}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {locales.map((locale) => (
                        <DropdownMenuItem
                          key={locale}
                          onClick={() => handleLanguageChange(locale)}
                        >
                          <span>{locale === 'en' ? t.header.language.english : t.header.language.chinese}</span>
                          {currentLocale === locale && <Check className="ml-auto h-4 w-4" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-4 pb-3 border-t border-border">
            {user ? (
              <div className="px-4 space-y-1">
                <div className="flex items-center px-3">
                  <div className="shrink-0">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={user.image || ""} alt={user.name || user.email || "User"} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                        {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-foreground">{user.name || "User"}</div>
                    <div className="text-sm font-medium text-muted-foreground">{user.email}</div>
                  </div>
                </div>
                <a href={`/${currentLocale}/settings`} className="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted">
                  {t.header.userMenu.personalSettings}
                </a>
                {user.role === 'admin' && (
                  <a href={`/${currentLocale}/admin`} className="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:text-foreground hover:bg-muted">
                    {t.header.userMenu.adminPanel || 'Admin Panel'}
                  </a>
                )}
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-destructive hover:bg-destructive/10"
                >
                  {t.header.auth.signOut}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-4 px-4 py-2">
                <Link to="/$lang/signin" params={{ lang: currentLocale }} className="w-1/2">
                  <Button variant="outline" className="w-full text-sm font-medium">
                    {t.header.auth.signIn}
                  </Button>
                </Link>
                <Link to="/$lang/signup" params={{ lang: currentLocale }} className="w-1/2">
                  <Button variant="default" className="w-full text-sm font-medium rounded-full">
                    {t.header.auth.getStarted}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
