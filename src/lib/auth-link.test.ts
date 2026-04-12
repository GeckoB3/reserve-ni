import { describe, expect, it } from 'vitest';
import {
  getAuthCode,
  getAuthErrorDetail,
  getAuthFailurePath,
  getAuthOtpParams,
  mapAuthErrorMessageToDetail,
  parseHashSearchParams,
  SET_PASSWORD_PATH,
} from './auth-link';

describe('auth-link helpers', () => {
  it('reads auth codes from query or hash params', () => {
    expect(getAuthCode(new URLSearchParams('code=query-code'))).toBe('query-code');
    expect(getAuthCode(new URLSearchParams(''), parseHashSearchParams('#code=hash-code'))).toBe('hash-code');
  });

  it('extracts supported OTP params', () => {
    expect(getAuthOtpParams(new URLSearchParams('token_hash=abc&type=invite'))).toEqual({
      tokenHash: 'abc',
      type: 'invite',
    });
    expect(getAuthOtpParams(new URLSearchParams('token_hash=abc&type=unknown'))).toBeNull();
  });

  it('maps auth errors to the correct detail', () => {
    expect(getAuthErrorDetail(new URLSearchParams('error=auth_callback_error&detail=otp_expired'))).toBe('otp_expired');
    expect(getAuthErrorDetail(new URLSearchParams('error=access_denied&error_description=Link expired'))).toBe('otp_expired');
    expect(mapAuthErrorMessageToDetail('bad code verifier')).toBe('otp_expired');
    expect(mapAuthErrorMessageToDetail('unexpected failure')).toBe('exchange_failed');
  });

  it('routes set-password failures back to the password page', () => {
    expect(getAuthFailurePath(SET_PASSWORD_PATH, 'otp_expired')).toBe(
      '/auth/set-password?error=auth_callback_error&detail=otp_expired',
    );
    expect(getAuthFailurePath('/dashboard', 'exchange_failed')).toBe(
      '/login?error=auth_callback_error&detail=exchange_failed',
    );
  });
});
