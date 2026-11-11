/** JWT payload embedded in every token issued by the auth service */
export interface TokenPayload {
  sub: string;
  email: string;
  type:
    | 'access'
    | 'refresh'
    | 'two-factor-login'
    | 'password-reset'
    | 'email-verification';
  jti: string;
  /** Nonce - ties a link token to the latest reset/verification request */
  prn?: string;
}

/** Verified profile returned by the Google OAuth userinfo endpoint */
export interface GoogleOAuthProfile {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
}

/** Shape of the decoded access-token used by the JWT strategy */
export interface JwtPayload {
  sub: string;
  email: string;
  jti?: string;
  type?: string;
  /** وقت الإصدار بالثواني (بيضيفه jsonwebtoken تلقائياً) */
  iat?: number;
}

/** Result when OAuth login requires 2FA verification */
export interface OAuthTwoFactorResult {
  requiresTwoFactor: true;
  loginToken: string;
  next?: string | null;
}

/** Result when OAuth login completes successfully */
export interface OAuthSuccessResult {
  requiresTwoFactor: false;
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; emailVerified: boolean };
  next?: string | null;
}

/** Discriminated union for OAuth callback results */
export type OAuthCallbackResult = OAuthTwoFactorResult | OAuthSuccessResult;
