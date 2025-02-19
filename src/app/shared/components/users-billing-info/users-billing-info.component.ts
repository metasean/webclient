import { Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Store } from '@ngrx/store';
import { Subscription, timer } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { take } from 'rxjs/operators';

import {
  CheckTransaction,
  ClearPromoCode,
  ClearWallet,
  CreateNewWallet,
  FinalLoading,
  GetUpgradeAmount,
  SignUp,
  SnackErrorPush,
  UpgradeAccount,
  ValidatePromoCode,
  CardAdd,
} from '../../../store/actions';
import {
  AppState,
  AuthState,
  BitcoinState,
  CheckTransactionResponse,
  Payment,
  PaymentMethod,
  PaymentType,
  PlanType,
  PricingPlan,
  PromoCode,
  SignupState,
  TransactionStatus,
  UserState,
} from '../../../store/datatypes';
import { OpenPgpService, SharedService } from '../../../store/services';
import { UserAccountInitDialogComponent } from '../../../users/dialogs/user-account-init-dialog/user-account-init-dialog.component';
import { DynamicScriptLoaderService } from '../../services/dynamic-script-loader.service';
import { apiUrl, PROMO_CODE_KEY, LANGUAGES } from '../../config';

@UntilDestroy()
@Component({
  selector: 'app-users-billing-info',
  templateUrl: './users-billing-info.component.html',
  styleUrls: ['./users-billing-info.component.scss'],
})
export class UsersBillingInfoComponent implements OnDestroy, OnInit {
  @Input() isUpgradeAccount: boolean;

  @Input() isRenew: boolean;

  @Input() isAddNewCard = false;

  @Input() paymentType: PaymentType;

  @Input() paymentMethod: PaymentMethod;

  @Input() currency: any;

  @Input() storage: number;

  @Input() planType: PlanType;

  @Output() closeBillingInfo = new EventEmitter<boolean>();

  paymentTypeEnum = PaymentType;

  cardNumber: number;

  promoCode: PromoCode = new PromoCode();

  billingForm: FormGroup;

  expiryMonth = 'Month';

  expiryYear = 'Year';

  cvc: number;

  months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  years: number[] = [];

  paymentMethodType = PaymentMethod;

  seconds = 60;

  minutes = 60;

  bitcoinState: BitcoinState;

  signupState: SignupState;

  inProgress: boolean;

  planTypeEnum = PlanType;

  stripePaymentValidation: any = {
    message: '',
    param: '',
  };

  showPaymentPending: boolean;

  paymentSuccess: boolean;

  errorMessage: string;

  authState: AuthState;

  isScriptsLoaded: boolean;

  isScriptsLoading: boolean;

  apiUrl: string = apiUrl;

  currentPlan: PricingPlan;

  upgradeAmount: number;

  payment: Payment;

  isPrime: boolean;

  /**
   * If applied promo code is full (new_amount = 0), it would not prompt Payment information
   */
  isNeedPaymentInformationWithPromoCode = true;

  private checkTransactionResponse: CheckTransactionResponse;

  private timerObservable: Subscription;

  private modalRef: NgbModalRef;

  private btcTimer: Subscription;

  get cardNumberFormControl() {
    return this.billingForm.get('cardNumber');
  }

  get promoCodeFormControl() {
    return this.billingForm.get('promoCode');
  }

  constructor(
    private sharedService: SharedService,
    private store: Store<AppState>,
    private router: Router,
    private formBuilder: FormBuilder,
    private openPgpService: OpenPgpService,
    private translate: TranslateService,
    private dynamicScriptLoader: DynamicScriptLoaderService,
    private activatedRoute: ActivatedRoute,
    private modalService: NgbModal,
    private ngzone: NgZone,
  ) {}

  ngOnInit() {
    let year = new Date().getFullYear();
    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < 11; index++) {
      this.years.push((year += 1));
    }
    this.store.dispatch(new ClearPromoCode());
    setTimeout(() => this.store.dispatch(new FinalLoading({ loadingState: false })));
    if (this.isUpgradeAccount && this.planType === PlanType.FREE) {
      this.paymentType = null;
      this.paymentMethod = null;
    }
    this.store
      .select(state => state.user)
      .pipe(untilDestroyed(this))
      .subscribe((userState: UserState) => {
        if (this.isUpgradeAccount) {
          this.upgradeAmount = userState.upgradeAmount;
          this.payment = userState.payment_transaction;
        }
        this.promoCode = userState.promoCode;
        this.promoCode.new_amount = this.promoCode.new_amount < 0 ? 0 : this.promoCode.new_amount;
        this.isNeedPaymentInformationWithPromoCode = !(
          this.promoCode.is_valid &&
          this.promoCode.new_amount === 0 &&
          this.promoCode.new_amount_btc === 0
        );
        this.isPrime = userState.isPrime;
      });

    this.billingForm = this.formBuilder.group({
      cardNumber: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      promoCode: '',
    });

    this.store
      .select(state => state.auth)
      .pipe(untilDestroyed(this))
      .subscribe((authState: AuthState) => {
        this.signupState = authState.signupState;

        const { queryParams } = this.activatedRoute.snapshot;
        this.planType = this.planType || this.signupState.plan_type || queryParams.plan || PlanType.PRIME;
        this.paymentType =
          this.paymentType || this.signupState.payment_type || queryParams.billing || PaymentType.ANNUALLY;
        this.paymentMethod = this.paymentMethod || this.signupState.payment_method || PaymentMethod.STRIPE;
        this.currency = this.currency || this.signupState.currency || 'USD';
        if (!this.promoCode.value) {
          this.promoCode.value = queryParams[PROMO_CODE_KEY] || localStorage.getItem(PROMO_CODE_KEY);
          this.validatePromoCode();
        }

        if (SharedService.PRICING_PLANS && (this.signupState.plan_type || this.planType)) {
          this.currentPlan = SharedService.PRICING_PLANS[this.signupState.plan_type || this.planType];
        }

        this.authState = authState;
        if (this.inProgress && !authState.inProgress) {
          if (authState.errorMessage) {
            this.errorMessage = authState.errorMessage;
          } else {
            this.closeBillingInfo.emit(true);
          }
        }
        if (this.paymentMethod === PaymentMethod.STRIPE) {
          this.loadStripeScripts();
        }
        this.inProgress = authState.inProgress;
      });
    this.store
      .select(state => state.bitcoin)
      .pipe(untilDestroyed(this))
      .subscribe((bitcoinState: BitcoinState) => {
        this.bitcoinState = bitcoinState;
        if (this.promoCode.is_valid) {
          this.promoCode.new_amount = this.promoCode.new_amount < 0 ? 0 : this.promoCode.new_amount;
          this.bitcoinState.bitcoinRequired = this.promoCode.new_amount_btc;
        }
        this.checkTransactionResponse = this.bitcoinState.checkTransactionResponse;

        if (this.checkTransactionResponse && this.checkTransactionResponse.status === TransactionStatus.RECEIVED) {
          this.paymentSuccess = true;
        }
      });
    if (!this.isUpgradeAccount) {
      setTimeout(() => {
        this.validateSignupData();
      }, 3000);
    }
    this.sharedService.loadPricingPlans();
  }

  timer() {
    if (this.timerObservable) {
      this.timerObservable.unsubscribe();
    }
    const timerReference: any = timer(1000, 1000);
    this.timerObservable = timerReference.pipe(untilDestroyed(this)).subscribe((t: number) => {
      this.seconds = (3600 - t) % 60;
      this.minutes = (3600 - t - this.seconds) / 60;
    });
  }

  private loadStripeScripts() {
    this.paymentMethod = PaymentMethod.STRIPE;
    this.getUpgradeAmount();
    if (this.btcTimer) {
      this.btcTimer.unsubscribe();
      this.btcTimer = null;
    }
    if (this.isScriptsLoading || this.isScriptsLoaded) {
      return;
    }
    this.isScriptsLoading = true;
    this.dynamicScriptLoader
      .load('stripe')
      .then(() => {
        this.dynamicScriptLoader
          .load('stripe-key')
          .then(() => {
            this.isScriptsLoaded = true;
            this.isScriptsLoading = false;
          })
          .catch(() => {
            this.isScriptsLoading = false;
          });
      })
      .catch(() =>
        this.store.dispatch(new SnackErrorPush({ message: 'Failed to load the payment processing gateway.' })),
      );
  }

  getToken() {
    this.inProgress = true;
    (<any>window).Stripe.card.createToken(
      {
        number: this.cardNumberFormControl.value,
        exp_month: this.expiryMonth,
        exp_year: this.expiryYear,
        cvc: this.cvc,
      },
      (status: number, response: any) => {
        // Wrapping inside the Angular zone
        this.ngzone.run(() => {
          this.inProgress = false;
          if (status === 200) {
            this.stripeSignup(response.id);
          } else {
            this.stripePaymentValidation = {
              message: response.error.message,
              param: response.error.param,
            };
          }
        });
      },
    );
  }

  getUpgradeAmount() {
    if (this.isUpgradeAccount) {
      this.store.dispatch(
        new GetUpgradeAmount({
          plan_type: this.planType,
          payment_type: this.paymentType,
          payment_method: this.paymentMethod,
          is_renew: this.isRenew,
        }),
      );
    }
  }

  submitForm() {
    if (this.planType === PlanType.FREE && this.isUpgradeAccount) {
      this.store.dispatch(new UpgradeAccount({ stripe_token: null, payment_type: null, plan_type: this.planType }));
      return;
    }
    // Reset Stripe validation
    this.stripePaymentValidation = {
      message: '',
      param: '',
    };

    if (this.paymentMethod === PaymentMethod.STRIPE) {
      if (this.isNeedPaymentInformationWithPromoCode) {
        this.getToken();
      } else {
        this.inProgress = true;
        this.openAccountInitModal();
        this.openPgpService.generateUserKeys(this.signupState.username, this.signupState.password);
        this.waitForPGPKeys({ ...this.signupState });
      }
    } else {
      this.bitcoinSignup();
    }
  }

  validateSignupData() {
    if (this.signupState && this.signupState.username && this.signupState.password) {
      return;
    }
    this.router.navigateByUrl(`/create-account?plan=${this.planType}&billing=${this.paymentType}`);
  }

  stripeSignup(stripe_token: any) {
    if (stripe_token) {
      if (this.isAddNewCard) {
        this.store.dispatch(new CardAdd(stripe_token));
        this.closeBillingInfo.emit(true);
      } else if (this.isUpgradeAccount) {
        this.store.dispatch(new UpgradeAccount(this.getSignupData({ stripe_token })));
      } else {
        this.inProgress = true;
        this.openAccountInitModal();
        this.openPgpService
          .generateUserKeys(this.signupState.username, this.signupState.password)
          .pipe(take(1))
          .subscribe(
            data => {
              if (data?.keys) {
                this.pgpKeyGenerationCompleted({ ...data.keys, ...this.signupState, stripe_token });
              }
            },
            error => {
              this.generateKeyFailed(error?.errorMessage);
            },
          );
      }
    } else {
      this.store.dispatch(new SnackErrorPush('Cannot create account, please reload page and try again.'));
    }
  }

  bitcoinSignup() {
    if (this.bitcoinState.newWalletAddress) {
      if (this.isUpgradeAccount) {
        this.store.dispatch(
          new UpgradeAccount(this.getSignupData({ from_address: this.bitcoinState.newWalletAddress })),
        );
      } else {
        this.inProgress = true;
        this.openAccountInitModal();
        this.openPgpService
          .generateUserKeys(this.signupState.username, this.signupState.password)
          .pipe(take(1))
          .subscribe(
            data => {
              if (data?.keys) {
                this.pgpKeyGenerationCompleted({
                  ...data.keys,
                  ...this.signupState,
                  from_address: this.bitcoinState.newWalletAddress,
                });
              }
            },
            error => {
              this.generateKeyFailed(error?.errorMessage);
            },
          );
      }
    } else {
      this.store.dispatch(
        new SnackErrorPush('No bitcoin wallet found, Unable to signup, please reload page and try again.'),
      );
    }
  }

  waitForPGPKeys(data: any) {
    setTimeout(() => {
      const userKeys = this.openPgpService.getUserKeys();
      if (userKeys) {
        this.pgpKeyGenerationCompleted({ ...userKeys, ...data });
        return;
      }
      const generateKeyError = this.openPgpService.getGenerateKeyError();
      if (generateKeyError) {
        this.generateKeyFailed(generateKeyError);
        return;
      }
      this.waitForPGPKeys(data);
    }, 1000);
  }

  generateKeyFailed(error: string) {
    this.errorMessage = error;
    this.inProgress = false;
    if (this.modalRef) {
      this.modalRef.componentInstance.closeModal();
    }
  }

  private getSignupData(data: any = {}) {
    if (this.promoCode.is_valid && this.promoCode.value) {
      data.promo_code = this.promoCode.value;
    }
    const currentLocale = this.translate.currentLang ? this.translate.currentLang : 'en';
    const currentLang = LANGUAGES.find((lang: any) => lang.locale === currentLocale);
    return {
      ...data,
      plan_type: this.planType,
      payment_type: this.paymentType,
      payment_method: this.paymentMethod,
      is_renew: this.isRenew,
      language: currentLang.name,
    };
  }

  pgpKeyGenerationCompleted(data: any) {
    if (this.modalRef) {
      this.modalRef.componentInstance.pgpGenerationCompleted();
    }
    this.store.dispatch(new SignUp(this.getSignupData(data)));
  }

  checkTransaction() {
    if (this.checkTransactionResponse.status === TransactionStatus.RECEIVED) {
      this.paymentSuccess = true;
      return;
    }
    const data: any = { from_address: this.bitcoinState.newWalletAddress };
    if (this.promoCode && this.promoCode.is_valid && this.promoCode.value) {
      data.promo_code = this.promoCode.value;
    }
    // check after every one minute
    this.store.dispatch(new CheckTransaction(data));
  }

  selectBitcoinMethod(forceLoad = true) {
    this.paymentMethod = PaymentMethod.BITCOIN;
    this.selectPaymentType(PaymentType.ANNUALLY);
    if (this.bitcoinState && this.bitcoinState.newWalletAddress && !forceLoad) {
      return;
    }
    this.stripePaymentValidation = {
      message: '',
      param: '',
    };
    setTimeout(() => {
      this.showPaymentPending = true;
    }, 15_000);

    this.timer();
    this.paymentSuccess = false;
    this.createNewWallet();
    this.btcTimer = timer(15_000, 10_000)
      .pipe(untilDestroyed(this))
      .subscribe(() => {
        this.checkTransaction();
      });
  }

  selectMoneroMethod() {
    this.paymentMethod = PaymentMethod.MONERO;
  }

  selectPaymentType(paymentType: PaymentType) {
    this.paymentType = paymentType;
    this.getUpgradeAmount();
    if (this.promoCode.is_valid) {
      this.validatePromoCode();
    }
  }

  createNewWallet() {
    this.store.dispatch(
      new CreateNewWallet({
        payment_type: this.paymentType,
        plan_type: this.planType,
        payment_method: this.paymentMethod,
        is_renew: this.isRenew,
      }),
    );
  }

  selectMonth(month: string) {
    this.expiryMonth = month;
    this.checkStripeValidation();
  }

  selectYear(year: string) {
    this.expiryYear = year;
    this.checkStripeValidation();
  }

  checkStripeValidation() {
    this.stripePaymentValidation.message = '';
    if (!(<any>window).Stripe.card.validateCardNumber(this.cardNumberFormControl.value)) {
      this.stripePaymentValidation.param = 'number';
    } else if (!(<any>window).Stripe.card.validateExpiry(this.expiryMonth, this.expiryYear)) {
      this.stripePaymentValidation.param = 'exp_year exp_month';
    } else if (!(<any>window).Stripe.card.validateCVC(this.cvc)) {
      this.stripePaymentValidation.param = 'cvc';
    }
  }

  onCancel(event: any) {
    event.preventDefault();
    if (this.isUpgradeAccount) {
      this.closeBillingInfo.emit(true);
    } else {
      this.router.navigateByUrl('/');
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

  validatePromoCode() {
    if (this.promoCode.value) {
      this.store.dispatch(
        new ValidatePromoCode({
          plan_type: this.planType,
          payment_type: this.paymentType,
          promo_code: this.promoCode.value,
        }),
      );
    }
  }

  ngOnDestroy() {
    this.store.dispatch(new ClearWallet());
    if (this.timerObservable) {
      this.timerObservable.unsubscribe();
    }

    this.dynamicScriptLoader.removeStripeFromDOM();
  }
}
