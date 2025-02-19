import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Observable, of, EMPTY } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { UsersService } from '../services';
import {
  AccountDetailsGet,
  AuthActionTypes,
  ChangePassword,
  ChangePasswordFailed,
  ChangePasswordSuccess,
  CheckUsernameAvailability,
  CheckUsernameAvailabilityError,
  CheckUsernameAvailabilitySuccess,
  DeleteAccount,
  DeleteAccountFailure,
  DeleteAccountSuccess,
  Update2FA,
  Update2FASuccess,
  ExpireSession,
  Get2FASecret,
  Get2FASecretSuccess,
  GetCaptcha,
  GetCaptchaSuccess,
  GetInvoices,
  LogIn,
  LogInFailure,
  LogInSuccess,
  Logout,
  RecoverPassword,
  RecoverPasswordFailure,
  RecoverPasswordSuccess,
  ResetPassword,
  ResetPasswordFailure,
  ResetPasswordSuccess,
  SignUp,
  SignUpFailure,
  SignUpSuccess,
  SnackErrorPush,
  SnackPush,
  UpgradeAccount,
  UpgradeAccountFailure,
  UpgradeAccountSuccess,
  VerifyCaptcha,
  VerifyCaptchaSuccess,
  SettingsUpdateSuccess,
  GetMailboxes,
  RefreshToken,
} from '../actions';
import { PlanType, SignupState } from '../datatypes';
import { SYNC_DATA_WITH_STORE, REMEMBER_ME, NOT_FIRST_LOGIN } from '../../shared/config';

@Injectable({
  providedIn: 'root',
})
export class AuthEffects {
  constructor(private actions: Actions, private authService: UsersService, private router: Router) {}

  @Effect()
  LogIn: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.LOGIN),
    map((action: LogIn) => action.payload),
    switchMap(payload => {
      return this.authService.signIn(payload).pipe(
        map(response => new LogInSuccess({ ...response, rememberMe: payload.rememberMe, fromLoginRequest: true })),
        catchError((errorResponse: any) => of(new LogInFailure(errorResponse.error))),
      );
    }),
  );

  @Effect({ dispatch: false })
  LogInSuccess: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.LOGIN_SUCCESS),
    tap(response => {
      if (response.payload.token) {
        if (response.payload.rememberMe) {
          localStorage.setItem(REMEMBER_ME, 'true');
        }
        if (response.payload.is_2fa_enabled || !response.payload.anti_phishing_phrase) {
          this.router.navigateByUrl('/mail');
        }
      }
    }),
  );

  @Effect({ dispatch: false })
  LogInFailure: Observable<any> = this.actions.pipe(ofType(AuthActionTypes.LOGIN_FAILURE));

  @Effect({ dispatch: false })
  RefreshToken: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.REFRESH_TOKEN),
    map((action: RefreshToken) => action.payload),
    switchMap(() => {
      return this.authService.refreshToken();
    }),
  );

  @Effect()
  SignUp: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.SIGNUP),
    map((action: SignUp) => action.payload),
    switchMap((payload: SignupState) => {
      delete payload.monthlyPrice;
      delete payload.annualPricePerMonth;
      delete payload.annualPriceTotal;
      localStorage.setItem(NOT_FIRST_LOGIN, 'true');
      localStorage.removeItem(SYNC_DATA_WITH_STORE);
      sessionStorage.removeItem(NOT_FIRST_LOGIN);
      sessionStorage.removeItem(SYNC_DATA_WITH_STORE);
      return this.authService.signUp(payload).pipe(
        switchMap(user => of(new SignUpSuccess(user), new LogInSuccess(user))),
        catchError(errorResponse =>
          of(
            new SignUpFailure(errorResponse.error),
            new SnackErrorPush({ message: 'Failed to signup, please try again.' }),
          ),
        ),
      );
    }),
  );

  @Effect({ dispatch: false })
  public LogOut: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.LOGOUT),
    tap(() => {
      this.authService.signOut();
    }),
  );

  @Effect()
  expireSession: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.EXPIRE_SESSION),
    map((action: ExpireSession) => action.payload),
    switchMap(() => {
      return this.authService.expireSession().pipe(
        switchMap(() => EMPTY),
        catchError(() => EMPTY),
      );
    }),
  );

  @Effect()
  checkUsernameAvailability: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.CHECK_USERNAME_AVAILABILITY),
    map((action: CheckUsernameAvailability) => action.payload),
    switchMap(payload => {
      if (!payload) {
        return of(new CheckUsernameAvailabilitySuccess({ exists: true }));
      }
      return this.authService.checkUsernameAvailability(payload).pipe(
        map(response => new CheckUsernameAvailabilitySuccess(response)),
        catchError(error =>
          of(
            new SnackErrorPush({ message: `Failed to check username availability. ${error.error}` }),
            new CheckUsernameAvailabilityError(),
          ),
        ),
      );
    }),
  );

  @Effect()
  RecoverPassword: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.RECOVER_PASSWORD),
    map((action: RecoverPassword) => action.payload),
    switchMap(payload => {
      return this.authService.recoverPassword(payload).pipe(
        switchMap(response => of(new RecoverPasswordSuccess(response))),
        catchError(error => of(new RecoverPasswordFailure(error.error))),
      );
    }),
  );

  @Effect()
  ResetPassword: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.RESET_PASSWORD),
    map((action: ResetPassword) => action.payload),
    switchMap(payload => {
      return this.authService.resetPassword(payload).pipe(
        switchMap(user => of(new LogInSuccess(user), new ResetPasswordSuccess(user))),
        catchError(error => of(new ResetPasswordFailure(error.error))),
      );
    }),
  );

  @Effect()
  UpgradeAccount: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.UPGRADE_ACCOUNT),
    map((action: UpgradeAccount) => action.payload),
    switchMap(payload => {
      if (payload.plan_type === PlanType.FREE) {
        payload = { plan_type: PlanType.FREE };
      }
      return this.authService.upgradeAccount(payload).pipe(
        switchMap(response => {
          return of(
            new UpgradeAccountSuccess(response),
            new AccountDetailsGet(),
            new GetInvoices(),
            new GetMailboxes(),
          );
        }),
        catchError(error =>
          of(
            new UpgradeAccountFailure(error.error),
            new SnackErrorPush({ message: 'Failed to upgrade account, please try again.' }),
          ),
        ),
      );
    }),
  );

  @Effect()
  ChangePassword: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.CHANGE_PASSWORD),
    map((action: ChangePassword) => action.payload),
    switchMap(payload => {
      return this.authService.changePassword(payload).pipe(
        switchMap(() => {
          if (payload.delete_data) {
            return of(new ExpireSession(), new Logout(), new SnackPush({ message: 'Password changed successfully.' }));
          }
          return of(
            new ChangePasswordSuccess(payload),
            new GetMailboxes(),
            new SnackPush({ message: 'Password changed successfully.' }),
          );
        }),
        catchError((response: any) =>
          of(
            new SnackErrorPush({ message: `Failed to change password, ${response.error}` }),
            new ChangePasswordFailed(response),
          ),
        ),
      );
    }),
  );

  @Effect()
  DeleteAccount: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.DELETE_ACCOUNT),
    map((action: DeleteAccount) => action.payload),
    switchMap(payload => {
      return this.authService.deleteAccount(payload).pipe(
        switchMap(() =>
          of(new DeleteAccountSuccess(), new SnackPush({ message: 'Account deleted successfully.' }), new Logout()),
        ),
        catchError(errorResponse =>
          of(
            new DeleteAccountFailure(errorResponse.error),
            new SnackErrorPush({
              message:
                errorResponse.error && errorResponse.error.detail
                  ? errorResponse.error.detail
                  : 'Failed to delete account, please try again.',
            }),
          ),
        ),
      );
    }),
  );

  @Effect()
  getCaptcha: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.GET_CAPTCHA),
    map((action: GetCaptcha) => action.payload),
    switchMap(() => {
      return this.authService.getCaptcha().pipe(
        switchMap((response: any) => of(new GetCaptchaSuccess(response))),
        catchError(errorResponse =>
          of(
            new SnackErrorPush({
              message:
                errorResponse.error && errorResponse.error.detail
                  ? errorResponse.error.detail
                  : 'Failed to load Captcha.',
            }),
          ),
        ),
      );
    }),
  );

  @Effect()
  verifyCaptcha: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.VERIFY_CAPTCHA),
    map((action: VerifyCaptcha) => action.payload),
    switchMap(payload => {
      return this.authService.verifyCaptcha(payload).pipe(
        switchMap((response: any) => {
          const events: any[] = [new VerifyCaptchaSuccess(response)];
          if (response.status === false) {
            events.push(new GetCaptcha());
          }
          return of(...events);
        }),
        catchError(errorResponse =>
          of(
            new SnackErrorPush({
              message:
                errorResponse.error && errorResponse.error.detail
                  ? errorResponse.error.detail
                  : 'Failed to verify Captcha.',
            }),
          ),
        ),
      );
    }),
  );

  @Effect()
  get2FASecret: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.GET_2FA_SECRET),
    map((action: Get2FASecret) => action.payload),
    switchMap(() => {
      return this.authService.get2FASecret().pipe(
        switchMap((response: any) => of(new Get2FASecretSuccess(response))),
        catchError(errorResponse =>
          of(
            new SnackErrorPush({
              message: `Failed to load secret, ${errorResponse.error}`,
            }),
          ),
        ),
      );
    }),
  );

  @Effect()
  enable2FA: Observable<any> = this.actions.pipe(
    ofType(AuthActionTypes.UPDATE_2FA),
    map((action: Update2FA) => action.payload),
    switchMap(payload => {
      return this.authService.update2FA(payload.data).pipe(
        switchMap((response: any) =>
          of(
            new Update2FASuccess(response),
            new SettingsUpdateSuccess(payload.settings),
            new SnackPush({
              message: `2 Factor authentication ${payload.data.enable_2fa ? 'enabled' : 'disabled'} successfully.`,
            }),
          ),
        ),
        catchError(errorResponse =>
          of(
            new SnackErrorPush({
              message: `Failed to ${payload.data.enable_2fa ? 'enable' : 'disable'} 2FA, ${
                errorResponse.error
              } Please try again.`,
            }),
          ),
        ),
      );
    }),
  );
}
