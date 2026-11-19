/**
 * Returns the token's email only if Firebase has verified it, otherwise null.
 * Use this whenever an email is used to look up or link an existing account.
 */
export function getVerifiedEmail(decodedToken) {
    if (!decodedToken || !decodedToken.email) return null;
    return decodedToken.email_verified === true ? decodedToken.email : null;
}
