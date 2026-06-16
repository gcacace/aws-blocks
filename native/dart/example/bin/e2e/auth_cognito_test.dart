import 'harness.dart';

/// AuthCognito E2E — Cognito-style auth with a sign-up confirmation code.
/// native-bindings configures: passwordPolicy { minLength: 8, requireDigits },
/// email attribute, selfSignUp, MFA off. The dev server's codeDelivery stashes
/// the last code, retrievable via cognitoGetLastCode.
void main() async {
  final blocks = createBlocks();
  final suffix = DateTime.now().millisecondsSinceEpoch.toString();
  final username = 'cognitouser_$suffix';
  final password = 'Passw0rd!'; // upper+lower+digit+symbol, >=8 (Cognito default policy)
  final email = '$username@example.com';

  group('AuthCognito: sign up');
  final signUp = await blocks.api.cognitoSignUp(
    username: username,
    password: password,
    email: email,
  );
  check(!signUp.isSignUpComplete, 'signUp pending confirmation (isSignUpComplete=false)');

  group('AuthCognito: get verification code');
  final codeResult = await blocks.api.cognitoGetLastCode();
  check(codeResult != null, 'code was delivered');
  check(codeResult?.username == username, 'code is for correct user');
  final code = codeResult!.code;

  group('AuthCognito: confirm sign up');
  final confirm = await blocks.api.cognitoConfirmSignUp(username: username, code: code);
  check(confirm.success, 'confirmSignUp returns success');

  group('AuthCognito: sign in');
  // cognitoSignIn returns a dynamic sign-in result; with MFA off it completes.
  final signIn = await blocks.api.cognitoSignIn(username: username, password: password);
  check(signIn != null, 'signIn returns a result');

  group('AuthCognito: checkAuth (authenticated)');
  final authed = await blocks.api.cognitoCheckAuth();
  check(authed == true, 'checkAuth returns true when signed in');

  group('AuthCognito: get current user (authenticated)');
  final current = await blocks.api.cognitoGetCurrentUser();
  check(current != null, 'getCurrentUser returns user');
  check(current?.username == username, 'current user matches (got: ${current?.username})');

  group('AuthCognito: requireAuth (authenticated)');
  final required = await blocks.api.cognitoRequireAuth();
  check(required.username == username, 'requireAuth returns current user');

  group('AuthCognito: sign out');
  final out = await blocks.api.cognitoSignOut();
  check(out.success, 'signOut returns success');

  group('AuthCognito: get current user (signed out)');
  final afterSignOut = await blocks.api.cognitoGetCurrentUser();
  check(afterSignOut == null, 'getCurrentUser returns null after sign out');

  group('AuthCognito: resend sign-up code (idempotent path)');
  // Re-sign-up a fresh user to exercise resend without a confirmed account.
  final username2 = 'cognitouser2_$suffix';
  await blocks.api.cognitoSignUp(
    username: username2,
    password: password,
    email: '$username2@example.com',
  );
  final resend = await blocks.api.cognitoResendSignUpCode(username: username2);
  check(resend.success, 'resendSignUpCode returns success');

  group('AuthCognito: wrong password');
  await expectError(
    () => blocks.api.cognitoSignIn(username: username, password: 'Wrong5678!'),
    label: 'wrong password throws error',
  );

  printResults();
}
