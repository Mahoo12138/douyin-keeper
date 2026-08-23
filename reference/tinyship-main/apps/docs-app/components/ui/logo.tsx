import { config } from '@config';
import Image from 'next/image';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon-only' | 'text-only';
  className?: string;
  showText?: boolean;
  textClassName?: string;
  iconClassName?: string;
}

export function Logo({ 
  size = 'md', 
  variant = 'full',
  className = '',
  showText = true,
  textClassName = '',
  iconClassName = ''
}: LogoProps) {
  const sizeConfig = {
    sm: {
      container: 'size-6',
      fullLogoHeight: 'h-6',
      text: 'text-sm',
      imageSize: 24
    },
    md: {
      container: 'size-8',
      fullLogoHeight: 'h-8',
      text: 'text-lg',
      imageSize: 32
    },
    lg: {
      container: 'size-10',
      fullLogoHeight: 'h-10',
      text: 'text-xl',
      imageSize: 40
    }
  };

  const currentSize = sizeConfig[size];
  const logoConfig = config.app.logo;

  // If fullLogoUrl is provided and we want full variant, use the full logo image
  if (variant === 'full' && logoConfig.fullLogoUrl) {
    return (
      <div className={`flex items-center ${currentSize.fullLogoHeight} ${logoConfig.iconClassName} ${className}`}>
        <Image 
          src={logoConfig.fullLogoUrl} 
          alt={config.app.name}
          width={currentSize.imageSize * 5}
          height={currentSize.imageSize}
          className="object-contain w-auto h-full"
        />
      </div>
    );
  }

  // Icon component - load from iconUrl
  const IconComponent = () => (
    <div className={`${currentSize.container} flex items-center justify-center ${logoConfig.iconClassName} ${iconClassName}`}>
      <Image 
        src={logoConfig.iconUrl} 
        alt={config.app.name}
        width={currentSize.imageSize}
        height={currentSize.imageSize}
        className="object-contain"
      />
    </div>
  );

  const TextComponent = () => (
    <span className={`font-bold text-foreground ${currentSize.text} ${textClassName}`}>
      {config.app.name}
    </span>
  );

  if (variant === 'icon-only') {
    return <IconComponent />;
  }

  if (variant === 'text-only') {
    return <TextComponent />;
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <IconComponent />
      {showText && <TextComponent />}
    </div>
  );
}
