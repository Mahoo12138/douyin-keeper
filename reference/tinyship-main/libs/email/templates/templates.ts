// 内联 MJML 模板（解决 monorepo 部署问题）
export const VERIFICATION_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-title>{{translations.email.verification.subject}}</mj-title>
    <mj-font name="Roboto" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700" />
    <mj-attributes>
      <mj-all font-family="Roboto, Arial, sans-serif" />
      <mj-text font-weight="400" font-size="16px" color="#000000" line-height="24px" />
      <mj-section padding="0px" />
    </mj-attributes>
    <mj-style>
      .link-nostyle { color: inherit; text-decoration: none }
      .footer-link { color: #888888; text-decoration: underline }
    </mj-style>
  </mj-head>
  
  <mj-body background-color="#f4f4f4">
    <!-- Header -->
    <mj-section padding="20px 0">
      <mj-column>
        <mj-image width="120px" src="{{base_url}}/android-chrome-192x192.png" alt="{{app_name}} Logo" />
      </mj-column>
    </mj-section>
    
    <!-- Main Content -->
    <mj-section background-color="#ffffff" padding="40px 30px" border-radius="8px">
      <mj-column>
        <mj-text font-size="24px" font-weight="500" color="#333333" align="center">
          {{translations.email.verification.title}}
        </mj-text>
        
        <mj-spacer height="20px" />
        
        <mj-text>
          {{translations.email.verification.greeting}}
        </mj-text>
        
        <mj-text padding-top="10px" padding-bottom="10px">
          {{translations.email.verification.message}}
        </mj-text>
        
        <mj-button background-color="#4A6CF7" color="white" border-radius="4px" font-weight="500" font-size="16px" padding="12px 20px" href="{{verification_url}}">
          {{translations.email.verification.button}}
        </mj-button>
        
        <mj-text padding-top="15px" font-size="14px">
          {{translations.email.verification.alternativeText}}<br />
          <a href="{{verification_url}}">{{verification_url}}</a>
        </mj-text>
        
        <mj-spacer height="15px" />
        
        <mj-text font-size="14px">
          {{translations.email.verification.expiry}}
        </mj-text>
        
        <mj-divider border-color="#f0f0f0" padding="20px 0" />
        
        <mj-text font-size="14px">
          {{translations.email.verification.disclaimer}}
        </mj-text>
        
        <mj-text font-size="14px">
          {{{translations.email.verification.signature}}}
        </mj-text>
      </mj-column>
    </mj-section>
    
    <!-- Footer -->
    <mj-section padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#888888">
          {{translations.email.verification.copyright}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

export const RESET_PASSWORD_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-title>{{translations.email.resetPassword.subject}}</mj-title>
    <mj-font name="Roboto" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700" />
    <mj-attributes>
      <mj-all font-family="Roboto, Arial, sans-serif" />
      <mj-text font-weight="400" font-size="16px" color="#000000" line-height="24px" />
      <mj-section padding="0px" />
    </mj-attributes>
    <mj-style>
      .link-nostyle { color: inherit; text-decoration: none }
      .footer-link { color: #888888; text-decoration: underline }
    </mj-style>
  </mj-head>
  
  <mj-body background-color="#f4f4f4">
    <!-- Header -->
    <mj-section padding="20px 0">
      <mj-column>
        <mj-image width="120px" src="{{base_url}}/android-chrome-192x192.png" alt="{{app_name}} Logo" />
      </mj-column>
    </mj-section>
    
    <!-- Main Content -->
    <mj-section background-color="#ffffff" padding="40px 30px" border-radius="8px">
      <mj-column>
        <mj-text font-size="24px" font-weight="500" color="#333333" align="center">
          {{translations.email.resetPassword.title}}
        </mj-text>
        
        <mj-spacer height="20px" />
        
        <mj-text>
          {{translations.email.resetPassword.greeting}}
        </mj-text>
        
        <mj-text padding-top="10px" padding-bottom="10px">
          {{translations.email.resetPassword.message}}
        </mj-text>
        
        <mj-button background-color="#4A6CF7" color="white" border-radius="4px" font-weight="500" font-size="16px" padding="12px 20px" href="{{reset_url}}">
          {{translations.email.resetPassword.button}}
        </mj-button>
        
        <mj-text padding-top="15px" font-size="14px">
          {{translations.email.resetPassword.alternativeText}}<br />
          <a href="{{reset_url}}">{{reset_url}}</a>
        </mj-text>
        
        <mj-spacer height="15px" />
        
        <mj-text font-size="14px">
          {{translations.email.resetPassword.expiry}}
        </mj-text>
        
        <mj-divider border-color="#f0f0f0" padding="20px 0" />
        
        <mj-text font-size="14px">
          {{translations.email.resetPassword.disclaimer}}
        </mj-text>
        
        <mj-text font-size="14px">
          {{{translations.email.resetPassword.signature}}}
        </mj-text>
      </mj-column>
    </mj-section>
    
    <!-- Footer -->
    <mj-section padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#888888">
          {{translations.email.resetPassword.copyright}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`; 