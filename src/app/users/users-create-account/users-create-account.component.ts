import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { debounceTime } from 'rxjs/operators';
import { NgbModalRef } from '@ng-bootstrap/ng-bootstrap/modal/modal-ref';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { BehaviorSubject } from 'rxjs';

import { AppState, AuthState, PaymentType, PlanType, SignupState } from '../../store/datatypes';
import { CheckUsernameAvailability, FinalLoading, SignUp, UpdateSignupData } from '../../store/actions';
import { OpenPgpService, SharedService, UsersService } from '../../store/services';
import { NotificationService } from '../../store/services/notification.service';
import { PRIMARY_WEBSITE, VALID_EMAIL_REGEX, LANGUAGES } from '../../shared/config';
import { UserAccountInitDialogComponent } from '../dialogs/user-account-init-dialog/user-account-init-dialog.component';

export const PasswordValidation = {
  MatchPassword(AC: AbstractControl) {
    const password = AC.get('password').value; // to get value in input tag
    const confirmPassword = AC.get('confirmPwd').value; // to get value in input tag
    if (password !== confirmPassword) {
      AC.get('confirmPwd').setErrors({ MatchPassword: true });
    }
  },
};

@UntilDestroy()
@Component({
  selector: 'app-users-create-account',
  templateUrl: './users-create-account.component.html',
  styleUrls: ['./users-create-account.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersCreateAccountComponent implements OnInit {
  isTextToggled = false;

  signupForm: FormGroup;

  isRecoveryEmail: boolean = undefined;

  isConfirmedPrivacy: boolean = undefined;

  errorMessage = '';

  selectedPlan: PlanType;

  planType = PlanType;

  data: any = undefined;

  signupInProgress$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  signupState$: BehaviorSubject<SignupState> = new BehaviorSubject<SignupState>({ recaptcha: '' });

  submitted = false;

  userKeys: any;

  generatingKeys: boolean;

  modalRef: NgbModalRef;

  inviteCode: string;

  referralCode = '';

  primaryWebsite = PRIMARY_WEBSITE;

  private paymentType: PaymentType;

  constructor(
    private modalService: NgbModal,
    private formBuilder: FormBuilder,
    private router: Router,
    private store: Store<AppState>,
    private openPgpService: OpenPgpService,
    private sharedService: SharedService,
    private activatedRoute: ActivatedRoute,
    private authService: UsersService,
    private notificationService: NotificationService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.handleUserState();
    this.signupForm = this.formBuilder.group(
      {
        username: [
          '',
          [
            Validators.required,
            Validators.pattern(/^[a-z]+([\da-z]*[._-]?[\da-z]+)+$/i),
            Validators.minLength(4),
            Validators.maxLength(64),
          ],
        ],
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            Validators.maxLength(128),
            Validators.pattern(/^(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{1,128}$/),
          ],
        ],
        confirmPwd: ['', [Validators.required, Validators.maxLength(128)]],
        recoveryEmail: ['', [Validators.pattern(VALID_EMAIL_REGEX)]],
      },
      {
        validator: PasswordValidation.MatchPassword,
      },
    );

    this.store
      .select(state => state.auth)
      .pipe(untilDestroyed(this))
      .subscribe((state: AuthState) => {
        const { queryParams } = this.activatedRoute.snapshot;
        this.selectedPlan = state.signupState.plan_type || queryParams.plan || PlanType.PRIME;
        this.paymentType = state.signupState.payment_type || queryParams.billing || PaymentType.ANNUALLY;
        if (Object.keys(queryParams).length > 0 && !queryParams.billing) {
          if (!Object.values(PlanType).includes(this.selectedPlan)) {
            this.selectedPlan = PlanType.FREE;
            this.router.navigateByUrl(`/create-account?plan=${this.selectedPlan}`);
          }
        } else if (
          Object.keys(queryParams).length > 0 &&
          (!Object.values(PlanType).includes(this.selectedPlan) ||
            !Object.values(PaymentType).includes(this.paymentType))
        ) {
          this.selectedPlan = PlanType.PRIME;
          this.paymentType = PaymentType.ANNUALLY;
          this.router.navigateByUrl(`/create-account?plan=${this.selectedPlan}&billing=${this.paymentType}`);
        } else if (Object.keys(queryParams).length === 0) {
          this.router.navigateByUrl(`/create-account?plan=${this.selectedPlan}&billing=${this.paymentType}`);
        }
        this.errorMessage = state.errorMessage;
      });

    setTimeout(() => this.store.dispatch(new FinalLoading({ loadingState: false })));
    this.handleUsernameAvailability();
    this.sharedService.loadPricingPlans();
    window.addEventListener('beforeunload', this.authService.onBeforeLoader, true);
  }

  // == Toggle password visibility
  togglePassword(input: any): any {
    if (!input.value) {
      return;
    }
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  // == Is text toggled
  toggleText(): void {
    const bool = this.isTextToggled;
    this.isTextToggled = bool === false;
  }

  signup() {
    this.submitted = true;
    if (this.isConfirmedPrivacy === undefined) {
      this.isConfirmedPrivacy = false;
    }

    if (this.isRecoveryEmail === undefined) {
      this.isRecoveryEmail = false;
    }

    if (
      this.signupState$.value.usernameExists !== false ||
      this.signupForm.invalid ||
      !this.isConfirmedPrivacy ||
      (!this.isRecoveryEmail &&
        (!this.signupForm.get('recoveryEmail').value || this.signupForm.get('recoveryEmail').invalid))
    ) {
      return;
    }

    if (this.selectedPlan !== PlanType.FREE) {
      this.navigateToBillingPage();
    } else {
      const reg = /^\d{4}-\d{4,6}$/;
      if (this.inviteCode && reg.test(this.inviteCode)) {
        this.signupFormCompleted();
      } else {
        this.errorMessage = this.translate.instant('create_account.insert_valid_inviteCode');
      }
    }
  }

  openAccountInitModal() {
    this.modalRef = this.modalService.open(UserAccountInitDialogComponent, {
      centered: true,
      windowClass: 'modal-sm',
      backdrop: 'static',
      keyboard: false,
    });
  }

  private navigateToBillingPage() {
    const signupData: SignupState = {
      recovery_email: this.signupForm.get('recoveryEmail').value,
      username: this.signupForm.get('username').value,
      password: this.signupForm.get('password').value,
      recaptcha: this.signupForm.value.captchaResponse,
    };
    if (this.referralCode) {
      signupData.referral_code = this.referralCode;
    }
    this.store.dispatch(new UpdateSignupData(signupData));
    this.router.navigateByUrl(`/billing-info?plan=${this.selectedPlan}&billing=${this.paymentType}`);
  }

  signupFormCompleted() {
    if (this.selectedPlan !== PlanType.FREE) {
      this.navigateToBillingPage();
    } else {
      this.signupInProgress$.next(true);
      this.openAccountInitModal();
      this.openPgpService.generateUserKeys(
        this.signupForm.get('username').value,
        this.signupForm.get('password').value,
      );
      this.waitForPGPKeys();
    }
  }

  waitForPGPKeys() {
    setTimeout(() => {
      this.userKeys = this.openPgpService.getUserKeys();
      if (this.userKeys) {
        this.pgpKeyGenerationCompleted();
        return;
      }
      const generateKeyError = this.openPgpService.getGenerateKeyError();
      if (generateKeyError) {
        this.generateKeyFailed(generateKeyError);
        return;
      }
      this.waitForPGPKeys();
    }, 1000);
  }

  generateKeyFailed(error: string) {
    this.errorMessage = error;
    this.signupInProgress$.next(false);
    if (this.modalRef) {
      this.modalRef.componentInstance.closeModal();
    }
  }

  pgpKeyGenerationCompleted() {
    if (this.modalRef) {
      this.modalRef.componentInstance.pgpGenerationCompleted();
    }
    const currentLocale = this.translate.currentLang ? this.translate.currentLang : 'en';
    const currentLang = LANGUAGES.find(lang => lang.locale === currentLocale);
    this.data = {
      ...this.userKeys,
      recovery_email: this.signupForm.get('recoveryEmail').value,
      username: this.signupForm.get('username').value,
      password: this.signupForm.get('password').value,
      invite_code: this.inviteCode,
      language: currentLang.name,
    };
    if (this.referralCode) {
      this.data.referral_code = this.referralCode;
    }
    this.store.dispatch(new SignUp(this.data));
  }

  private handleUserState(): void {
    this.store
      .select(state => state.auth)
      .pipe(untilDestroyed(this))
      .subscribe((authState: AuthState) => {
        if (this.signupInProgress$.value && !authState.inProgress) {
          if (authState.errorMessage) {
            this.notificationService.showSnackBar(`Failed to create account.${authState.errorMessage}`);
          }
          this.signupInProgress$.next(false);
        }
        this.signupState$.next(authState.signupState);
      });
  }

  handleUsernameAvailability() {
    this.signupForm
      .get('username')
      .valueChanges.pipe(debounceTime(500))
      .subscribe(username => {
        if (!this.signupForm.controls.username.errors) {
          this.store.dispatch(new CheckUsernameAvailability(username));
        }
      });
  }
}
