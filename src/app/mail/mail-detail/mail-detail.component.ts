import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Store } from '@ngrx/store';
import { take } from 'rxjs/operators';
import * as xss from 'xss';

import { PRIMARY_WEBSITE, SummarySeparator } from '../../shared/config';
import { FilenamePipe } from '../../shared/pipes/filename.pipe';
import { EmailFormatPipe } from '../../shared/pipes/email-formatting.pipe';
import { SafePipe } from '../../shared/pipes/safe.pipe';
import { WebSocketState } from '../../store';
import {
  DeleteMail,
  DeleteMailForAll,
  GetMailDetailSuccess,
  GetMails,
  MoveMail,
  SendMail,
  SnackErrorPush,
  StarMail,
  WhiteListAdd,
} from '../../store/actions';
import { ClearMailDetail, GetMailDetail, ReadMail } from '../../store/actions/mail.actions';
import {
  AppState,
  ContactsState,
  MailAction,
  MailBoxesState,
  MailState,
  NumberBooleanMappedType,
  NumberStringMappedType,
  PGPEncryptionType,
  SecureContent,
  StringBooleanMappedType,
  UserState,
} from '../../store/datatypes';
import { Attachment, Folder, Mail, Mailbox, MailFolderType } from '../../store/models/mail.model';
import { LOADING_IMAGE, MailService, MessageDecryptService, OpenPgpService, SharedService } from '../../store/services';
import { ComposeMailService } from '../../store/services/compose-mail.service';
import { DateTimeUtilService } from '../../store/services/datetime-util.service';
import { Subject } from 'rxjs/internal/Subject';

declare let Scrambler: (argument0: { target: string; random: number[]; speed: number; text: string }) => void;

@UntilDestroy()
@Component({
  selector: 'app-mail-detail',
  templateUrl: './mail-detail.component.html',
  styleUrls: ['./mail-detail.component.scss'],
})
// eslint-disable-next-line import/prefer-default-export
export class MailDetailComponent implements OnInit, OnDestroy {
  @ViewChild('forwardAttachmentsModal') forwardAttachmentsModal: any;

  @ViewChild('externalLinkConfirmModal') externalLinkConfirmModal: any;

  @ViewChild('includeAttachmentsModal') includeAttachmentsModal: any;

  @ViewChild('incomingHeadersModal') incomingHeadersModal: any;

  mail: Mail;

  composeMailData: any = {};

  mailFolderTypes = MailFolderType;

  decryptedContents: any = {};

  decryptedContentsPlain: any = {};

  decryptedAttachments: any = {};

  decryptedHeaders: any = {};

  isDecryptingError: StringBooleanMappedType = {};

  selectedHeaders: string;

  mailOptions: any = {};

  selectedMailToForward: Mail;
  
  currentForwardingNewEmail: Mail;

  selectedMailToInclude: Mail;

  isDecrypting: any = {};

  mailFolder: MailFolderType;

  customFolders: Folder[] = [];

  showGmailExtraContent: boolean;

  folderColors: any = {};

  markedAsRead: boolean;

  externalLinkChecked = true;

  currentMailIndex: number;

  currentMailNumber: any;

  MAX_EMAIL_PAGE_LIMIT = 1;

  OFFSET = 0;

  loadingImage = LOADING_IMAGE;

  disableMoveTo: boolean;

  isMobile: boolean;

  primaryWebsite = PRIMARY_WEBSITE;

  showRawContent: any = {};

  isDarkMode: boolean;

  isConversationView: boolean;

  forceLightMode: boolean;

  progressBar: boolean;

  disableExternalImages: boolean;

  includeOriginMessage: boolean;

  xssPipe = SafePipe;

  hasDraft = false;

  plainTextViewState: any = {};

  isPasswordEncrypted: NumberBooleanMappedType = {};

  /**
   * Represents if mail is expanded or not
   * If mail's folder is Draft, then would represent Composer is opened or not
   */
  mailExpandedStatus: NumberBooleanMappedType = {};

  errorMessageForDecryptingWithPassword: NumberStringMappedType = {};

  private currentMailbox: Mailbox;

  private forwardAttachmentsModalRef: NgbModalRef;

  externalLinkConfirmModalRef: NgbModalRef;

  private includeAttachmentsModalRef: NgbModalRef;

  private userState: UserState;

  private mailboxes: Mailbox[];

  private canScroll = true;

  private page: number;

  private mails: Mail[] = [];

  private EMAILS_PER_PAGE: number;

  private shouldChangeMail = 0;

  /**
   * @private
   * @var isShowTrashRelatedChildren
   * @description
   * If you are in trash folder, means to show non-trash children or not
   * If you are in non-trash folder, this means to show trash children or not
   */
  private isShowTrashRelatedChildren = false;

  /**
   * @private
   * @var isShowTrashRelatedChildren
   * @description
   * Indicate whether the parent is secure message or not
   * If it's secure message, it would be encrypted based password, should be decrypted with password
   */
  private isSecureMessage = false;

  /**
   * @private
   * @var isShowTrashRelatedChildren
   * @description
   * Indicate to contain trash / non-trash children on the conversation
   */
  private isContainTrashRelatedChildren = false;

  private properFolderLastChildIndex = 0;

  contacts: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private activatedRoute: ActivatedRoute,
    private store: Store<AppState>,
    private pgpService: OpenPgpService,
    private shareService: SharedService,
    private router: Router,
    private composeMailService: ComposeMailService,
    private dateTimeUtilService: DateTimeUtilService,
    private modalService: NgbModal,
    private mailService: MailService,
    private messageDecryptService: MessageDecryptService,
  ) {}

  ngOnInit() {
    SafePipe.hasExternalImages = false;
    /**
     * Check getting mail is succeeded
     */
    this.store
      .select((state: any) => state.webSocket)
      .pipe(untilDestroyed(this))
      .subscribe((webSocketState: WebSocketState) => {
        if (webSocketState.message && !webSocketState.isClosed) {
          if (
            this.mail &&
            (webSocketState.message.id === this.mail.id || webSocketState.message.parent_id === this.mail.id)
          ) {
            this.store.dispatch(new GetMailDetailSuccess(webSocketState.message.mail));
            if (!webSocketState.message.mail.read) {
              this.markAsRead(this.mail.id);
            }
          }
        }
      });
    /**
     * Get mails from DB
     */
    this.store
      .select(state => state.mail)
      .pipe(untilDestroyed(this))
      .subscribe((mailState: MailState) => {
        this.mails = [...mailState.mails];
        if (this.shouldChangeMail && mailState.loaded) {
          if (this.shouldChangeMail === 1) {
            this.mail.id = this.mails[this.mails.length - 1].id;
            this.changeMail(this.mails.length - 1);
          } else if (this.shouldChangeMail === 2) {
            this.mail.id = this.mails[0].id;
            this.changeMail(0);
          }
          this.shouldChangeMail = 0;
        }
        if (mailState.mailDetail && mailState.noUnreadCountChange) {
          this.mail = mailState.mailDetail;
          // Setting the password encryption mail or not
          this.isPasswordEncrypted[this.mail.id] = !!this.mail.encryption;
          if (!this.isPasswordEncrypted[this.mail.id] && this.mail.is_subject_encrypted) {
            this.scrambleText('subject-scramble');
          }

          this.mail.has_children = this.mail.has_children || (this.mail.children && this.mail.children.length > 0);
          const decryptedContent = mailState.decryptedContents[this.mail.id];
          if (this.mail.folder === MailFolderType.OUTBOX && !this.mail.is_encrypted) {
            this.decryptedContents[this.mail.id] = this.mail.content;
          } else {
            // Do decrypt, if not has children && needed
            if (
              !this.isPasswordEncrypted[this.mail.id] &&
              !this.mail.has_children &&
              this.mail.content !== undefined &&
              !this.isDecrypting[this.mail.id] &&
              (!decryptedContent || (!decryptedContent.inProgress && decryptedContent.content === undefined))
            ) {
              this.isDecrypting[this.mail.id] = true;
              // TODO - This If statement should be removed after integrated all of decryption logic to 'MesssageDecryptService
              if (this.mail.encryption_type === PGPEncryptionType.PGP_MIME) {
                this.messageDecryptService.decryptMessage(this.mail).subscribe(
                  () => {},
                  error => {
                    this.decryptedContents[this.mail.id] = this.mail.content;
                    this.isDecrypting[this.mail.id] = false;
                  },
                );
              } else {
                this.pgpService.decrypt(this.mail.mailbox, this.mail.id, new SecureContent(this.mail)).subscribe(
                  () => {},
                  error => {
                    this.decryptedContents[this.mail.id] = this.mail.content;
                    this.isDecrypting[this.mail.id] = false;
                  },
                );
              }
            }
            // If done to decrypt, or already existed decrypted content
            if (decryptedContent && !decryptedContent.inProgress && decryptedContent.content !== undefined) {
              this.decryptedContents[this.mail.id] = this.mail.is_html
                ? decryptedContent.content.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
                : decryptedContent.content || decryptedContent.content_plain;
              if (this.externalLinkChecked) {
                this.confirmExternalLinks();
              }
              if (this.mail.is_subject_encrypted) {
                this.mail.subject = decryptedContent.subject;
              }
              this.decryptedContentsPlain[this.mail.id] = decryptedContent.content_plain;
              this.decryptedHeaders[this.mail.id] = this.parseHeaders(decryptedContent.incomingHeaders);
              this.isDecryptingError[this.mail.id] = decryptedContent.decryptError;
              this.handleEmailLinks();

              // Automatically scrolls to last element in the list
              // Class name .last-child is set inside the template
              if (this.canScroll && this.mail.children && this.mail.children.length > 0) {
                setTimeout(() => {
                  this.canScroll = false;
                }, 3000);
                this.scrollTo(document.querySelector('.last-child'));
              }
              // Mark mail as read
              if (!this.mail.read && !this.markedAsRead) {
                this.markedAsRead = true;
                this.markAsRead(this.mail.id);
              }
            }
          }
          if (!this.mailOptions[this.mail.id]) {
            this.mailOptions[this.mail.id] = {};
          }

          /**
           * Process for Childrens
           */
          if (this.mail.children && this.mail.children.length > 0) {
            if (this.mailExpandedStatus[this.mail.id] === undefined) {
              this.mailExpandedStatus[this.mail.id] = false;
            }
            this.mail.children.forEach(child => {
              this.isPasswordEncrypted[child.id] = !!child.encryption;
            });
            // find the latest child with trash/non-trash folder and excluding Draft folder messages
            let filteredChildren = [];
            if (this.mailFolder === MailFolderType.TRASH) {
              filteredChildren = this.mail.children.filter(child => child.folder === MailFolderType.TRASH);
            } else {
              filteredChildren = this.mail.children.filter(
                child => child.folder !== MailFolderType.TRASH && child.folder !== MailFolderType.DRAFT,
              );
            }
            if (filteredChildren.length > 0) {
              const lastFilteredChild = filteredChildren[filteredChildren.length - 1];
              if (!this.isPasswordEncrypted[lastFilteredChild.id]) {
                this.decryptChildEmails(lastFilteredChild);
              }

              this.mailExpandedStatus[lastFilteredChild.id] =
                this.mailExpandedStatus[lastFilteredChild.id] !== undefined
                  ? this.mailExpandedStatus[lastFilteredChild.id]
                  : true;
            }
            this.mail.children.forEach(child => {
              this.backupChildDecryptedContent(child, mailState);
            });
            setTimeout(() => {
              if (this.mail) {
                if (
                  !this.isPasswordEncrypted[this.mail.id] &&
                  !this.isDecrypting[this.mail.id] &&
                  this.mail.content &&
                  (!decryptedContent ||
                    (!decryptedContent.inProgress && !decryptedContent.content && this.mail.content))
                ) {
                  this.isDecrypting[this.mail.id] = true;
                  if (this.mail.encryption_type === PGPEncryptionType.PGP_MIME) {
                    this.messageDecryptService
                      .decryptMessage(this.mail, false)
                      .pipe(take(1))
                      .subscribe(
                        () => {},
                        error => {},
                      );
                  } else {
                    this.pgpService
                      .decrypt(this.mail.mailbox, this.mail.id, new SecureContent(this.mail))
                      .pipe(take(1))
                      .subscribe(
                        () => {},
                        error => {},
                      );
                  }
                }
              }
            }, 1000);
          } else if (!this.mail.has_children) {
            if (this.mailExpandedStatus[this.mail.id] === undefined) this.mailExpandedStatus[this.mail.id] = true;
          }
        }
        if (mailState.mailDetailLoaded) {
          this.progressBar = true;
        }
        if (this.mails.length > 0 && this.mail && mailState.loaded) {
          this.MAX_EMAIL_PAGE_LIMIT = mailState.total_mail_count;
          this.currentMailIndex = this.mails.findIndex(item => item.id === this.mail.id);
          this.currentMailNumber = this.EMAILS_PER_PAGE * (this.page - 1) + this.currentMailIndex + 1 || '-';
        }
        if (
          !mailState.loaded &&
          this.mails.length === 0 &&
          !mailState.inProgress &&
          this.EMAILS_PER_PAGE &&
          this.mailFolder !== MailFolderType.SEARCH
        ) {
          this.store.dispatch(
            new GetMails({
              limit: this.EMAILS_PER_PAGE,
              inProgress: true,
              offset: this.OFFSET,
              folder: this.mailFolder,
            }),
          );
        }

        if (this.mail && this.mail.children) {
          const draft_children = this.mail.children.filter(child => child.folder === 'draft');
          this.hasDraft = !!(draft_children.length > 0);
          // Get whether this contains trash/non-trash children
          if (
            (this.mailFolder !== MailFolderType.TRASH &&
              (this.mail.children.filter(child => child.folder === MailFolderType.TRASH).length > 0 ||
                this.mail.folder === MailFolderType.TRASH)) ||
            (this.mailFolder === MailFolderType.TRASH &&
              (this.mail.children.filter(child => child.folder !== MailFolderType.TRASH).length > 0 ||
                this.mail.folder !== MailFolderType.TRASH))
          ) {
            this.isContainTrashRelatedChildren = true;
          } else {
            this.isContainTrashRelatedChildren = false;
          }
        }
      });

    this.store
      .select(state => state.mailboxes)
      .pipe(untilDestroyed(this))
      .subscribe((mailBoxesState: MailBoxesState) => {
        this.currentMailbox = mailBoxesState.currentMailbox;
        this.mailboxes = mailBoxesState.mailboxes;
      });
    /**
     * Get folder and page from route
     */
    this.route.params.pipe(untilDestroyed(this)).subscribe(parameters => {
      const id = +parameters.id;
      this.mailFolder = parameters.folder as MailFolderType;
      this.disableMoveTo = this.mailFolder === MailFolderType.OUTBOX || this.mailFolder === MailFolderType.DRAFT;
      this.page = +parameters.page;
      this.getMailDetail(id);
    });
    /**
     * Get user settings
     */
    this.store
      .select(state => state.user)
      .pipe(untilDestroyed(this))
      .subscribe((user: UserState) => {
        this.customFolders = user.customFolders;
        user.customFolders.forEach(folder => {
          this.folderColors[folder.name] = folder.color;
        });
        this.userState = user;
        this.isDarkMode = this.userState.settings.is_night_mode;
        this.isConversationView = this.userState.settings.is_conversation_mode;
        this.EMAILS_PER_PAGE = user.settings.emails_per_page;
        this.disableExternalImages = this.userState.settings.is_disable_loading_images;
        this.includeOriginMessage = this.userState.settings.include_original_message;
      });

    this.isMobile = window.innerWidth <= 768;
    this.activatedRoute.queryParams.pipe(untilDestroyed(this)).subscribe((parameters: Params) => {
      this.forceLightMode = parameters.lightMode;
    });

    /**
     * Get user's contacts from store.
     */
    this.store
      .select((state: AppState) => state.contacts)
      .pipe(untilDestroyed(this))
      .subscribe((contactsState: ContactsState) => {
        this.contacts =
          contactsState.emailContacts === undefined ? contactsState.contacts : contactsState.emailContacts;
      });
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.isMobile = window.innerWidth <= 768;
  }

  decryptWithPassword(inputID: string, mail: Mail) {
    const input = <HTMLInputElement>document.getElementById(inputID);
    if (!mail) return;
    if (!input.value) {
      return;
    }
    this.isDecrypting[mail.id] = true;
    this.mailExpandedStatus[mail.id] = true;
    this.pgpService
      .decryptPasswordEncryptedContent(mail.mailbox, mail.id, new SecureContent(mail), input.value)
      .pipe(take(1))
      .subscribe(
        () => {
          this.errorMessageForDecryptingWithPassword[mail.id] = '';
          this.isDecrypting[mail.id] = false;
        },
        error => {
          this.errorMessageForDecryptingWithPassword[mail.id] = 'Password is incorrect';
          this.isDecrypting[mail.id] = false;
        },
      );
  }

  confirmExternalLinks() {
    this.externalLinkChecked = false;
    setTimeout(() => {
      const exLinks = document.querySelectorAll('.msg-reply-content a');
      if (exLinks?.length > 0) {
        for (const i in exLinks) {
          if (exLinks[i]?.innerHTML && exLinks[i].getAttribute('href')) {
            exLinks[i].addEventListener('click', event => {
              event.preventDefault();
              this.externalLinkConfirmModalRef = this.modalService.open(this.externalLinkConfirmModal, {
                centered: true,
                windowClass: 'modal-sm users-action-modal',
              });
              this.externalLinkConfirmModalRef.result.then(result => {
                if (result) {
                  const link = document.createElement('a');
                  link.href = exLinks[i].getAttribute('href');
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  link.click();
                }
                this.externalLinkConfirmModalRef = null;
              });
            });
          }
        }
      }
    }, 1000);
  }

  scrambleText(elementId: string) {
    if (!this.decryptedContents[this.mail.id]) {
      setTimeout(() => {
        Scrambler({
          target: `#${elementId}`,
          random: [1000, 120000],
          speed: 70,
          text: 'A7gHc6H66A9SAQfoBJDq4C7',
        });
      }, 100);
    }
  }

  changeMail(index: number) {
    if (index < 0 || index >= this.mails.length) {
      if (index >= this.EMAILS_PER_PAGE) {
        this.shouldChangeMail = 2;
        this.page++;
      } else if (index <= 0 && this.page > 1) {
        this.page--;
        this.shouldChangeMail = 1;
      } else {
        return;
      }
      this.store.dispatch(
        new GetMails({
          forceReload: true,
          limit: this.EMAILS_PER_PAGE,
          offset: this.EMAILS_PER_PAGE * (this.page - 1),
          folder: this.mailFolder,
        }),
      );
      return;
    }
    this.mail = null;
    setTimeout(() => {
      this.markedAsRead = false;
      this.router.navigateByUrl(`/mail/${this.mailFolder}/page/${this.page}/message/${this.mails[index].id}`);
    }, 500);
  }

  /**
   * Input email links to compose receivers
   */
  handleEmailLinks() {
    setTimeout(() => {
      const anchorElements = document.querySelectorAll('a');
      for (const i in anchorElements) {
        if (anchorElements.hasOwnProperty(i) && anchorElements[i].href.indexOf('mailto:') === 0) {
          const receivers = [anchorElements[i].href.split('mailto:')[1]];
          anchorElements[i].addEventListener('click', event => {
            event.preventDefault();
            this.composeMailService.openComposeMailDialog({
              receivers,
              isFullScreen: this.userState.settings.is_composer_full_screen,
            });
          });
          anchorElements[i].href = '';
        }
      }
    }, 1000);
  }

  viewEmailInLightMode() {
    const win = window.open(`${document.location.href}?lightMode=true`, '_blank');
    win.focus();
  }

  isNeedRemoveStar(mail: Mail): boolean {
    if (!mail) {
      return false;
    }
    if (!this.isConversationView) {
      return mail.starred;
    }
    if (mail.starred) {
      return true;
    }
    if (mail.children && mail.children.length > 0) {
      return mail.children.some(child => child.starred) || mail.starred;
    }
    return false;
  }

  isNeedAddStar(mail: Mail): boolean {
    if (!mail) {
      return false;
    }
    if (!this.isConversationView) {
      return !mail.starred;
    }
    if (!mail.starred) {
      return true;
    }
    if (mail.children && mail.children.length > 0) {
      return mail.children.some(child => !child.starred) || !mail.starred;
    }
    return false;
  }

  toggleGmailExtra(mail: Mail) {
    if (!this.mailOptions[mail.id]) {
      this.mailOptions[mail.id] = {};
    }
    this.mailOptions[mail.id].showGmailExtraContent = !this.mailOptions[mail.id].showGmailExtraContent;
  }

  decryptChildEmails(child: Mail) {
    if (child.folder === MailFolderType.OUTBOX && !child.is_encrypted) {
      this.decryptedContents[child.id] = child.content;
    } else {
      const childDecryptedContent = this.decryptedContents[child.id];
      if (
        !this.isDecrypting[child.id] &&
        (!childDecryptedContent ||
          (!childDecryptedContent.inProgress && !childDecryptedContent.content && child.content))
      ) {
        this.isDecrypting[child.id] = true;
        if (child.encryption_type === PGPEncryptionType.PGP_MIME) {
          this.messageDecryptService
            .decryptMessage(child, false)
            .pipe(take(1))
            .subscribe(
              () => {},
              error => {},
            );
        } else {
          this.pgpService
            .decrypt(child.mailbox, child.id, new SecureContent(child))
            .pipe(take(1))
            .subscribe(
              () => {},
              error => {},
            );
        }
      }
    }
  }

  backupChildDecryptedContent(child: Mail, mailState: MailState) {
    if (child.folder === MailFolderType.OUTBOX && !child.is_encrypted) {
      this.decryptedContents[child.id] = child.content;
    } else {
      const childDecryptedContent = mailState.decryptedContents[child.id];
      if (childDecryptedContent && !childDecryptedContent.inProgress && childDecryptedContent.content) {
        const decryptedContents = child.is_html
          ? childDecryptedContent.content.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
          : childDecryptedContent.content;
        this.decryptedContents[child.id] = decryptedContents;
        this.decryptedContentsPlain[child.id] = childDecryptedContent.content_plain;
        if (child.is_subject_encrypted) {
          child.subject = childDecryptedContent.subject;
        }
        this.decryptedHeaders[child.id] = this.parseHeaders(childDecryptedContent.incomingHeaders);
        this.isDecryptingError[child.id] = childDecryptedContent.decryptError;
        this.handleEmailLinks();
      }
    }
    if (!this.mailOptions[child.id]) {
      this.mailOptions[child.id] = {};
    }
  }

  /**
   * Parse headers with new json format from origin headers
   */
  parseHeaders(headers: any) {
    if (!headers) {
      return [];
    }
    try {
      headers = JSON.parse(headers);
      const headersArray: { key: string; value: any }[] = [];
      headers.forEach((header: any) => {
        Object.keys(header).forEach(key => {
          if (header.hasOwnProperty(key)) {
            headersArray.push({ key, value: header[key] });
          }
        });
      });
      return headersArray;
    } catch {
      return [];
    }
  }

  getMailDetail(messageId: number) {
    this.store.dispatch(new GetMailDetail({ messageId, folder: this.mailFolder }));
  }

  downloadAllAttachments(mail: Mail) {
    if (mail?.attachments) {
      for (let i = 0; i < mail.attachments.length; i++) {
        this.decryptAttachment(mail.attachments[i], mail);
      }
    }
  }

  // TODO: Merge with display-secure-message and compose-mail components
  decryptAttachment(attachment: Attachment, mail: Mail) {
    if (attachment.is_encrypted) {
      if (this.decryptedAttachments[attachment.id]) {
        if (!this.decryptedAttachments[attachment.id].inProgress) {
          this.downloadAttachment(this.decryptedAttachments[attachment.id]);
        }
      } else {
        this.decryptedAttachments[attachment.id] = { ...attachment, inProgress: true };
        this.mailService.getAttachment(attachment).subscribe(
          response => {
            if (!attachment.name) {
              attachment.name = FilenamePipe.tranformToFilename(attachment.document);
            }
            const fileInfo = { attachment, type: response.file_type };
            this.pgpService
              .decryptAttachment(mail.mailbox, response.data, fileInfo)
              .pipe(take(1))
              .subscribe(
                (decryptedAttachment: Attachment) => {
                  this.decryptedAttachments[attachment.id] = { ...decryptedAttachment, inProgress: false };
                  this.downloadAttachment(decryptedAttachment);
                },
                error => this.store.dispatch(new SnackErrorPush({ message: 'Failed to decrypt attachment.' })),
              );
          },
          errorResponse =>
            this.store.dispatch(
              new SnackErrorPush({
                message: errorResponse.error || 'Failed to download attachment.',
              }),
            ),
        );
      }
    }
  }

  downloadAttachment(attachment: Attachment) {
    this.shareService.downloadFile(attachment.decryptedDocument);
  }

  markAsStarred(starred = true, withChildren = true) {
    this.store.dispatch(new StarMail({ ids: `${this.mail.id}`, starred, withChildren }));
  }

  markAsRead(mailID: number, read = true) {
    this.store.dispatch(new ReadMail({ ids: mailID.toString(), read }));
    if (!read) {
      this.goBack();
    }
  }

  ngOnDestroy(): void {
    this.store.dispatch(new ClearMailDetail(this.mail || {}));
  }

  showIncomingHeaders(mail: Mail) {
    this.selectedHeaders = this.decryptedHeaders[mail.id];
    this.modalService.open(this.incomingHeadersModal, {
      centered: true,
      windowClass: this.selectedHeaders.length === 0 ? 'modal-sm' : '',
    });
  }

  setActionParent(mail: Mail, isChildMail: boolean, mainReply: boolean) {
    if (!isChildMail && mainReply) {
      if (this.mail.children && this.mail.children.length > 0) {
        this.composeMailData[mail.id].action_parent_id = this.mail.children[this.mail.children.length - 1].id;
      } else {
        this.composeMailData[mail.id].action_parent_id = this.mail.id;
      }
    } else {
      this.composeMailData[mail.id].action_parent_id = mail.id;
    }
  }

  onReply(mail: Mail, index = 0, isChildMail?: boolean, mainReply = false) {
    const newMail: Mail = {
      content: '',
    };
    const previousMails = this.getPreviousMail(index, isChildMail, mainReply);
    const allRecipients = new Set([...mail.receiver, mail.sender, mail.cc, mail.bcc]);
    let parentId = this.mail.id;
    if (!this.isConversationView && this.mail.parent) {
      parentId = this.mail.parent;
    }
    newMail.subject = `Re: ${mail.subject}`;
    newMail.parent = parentId;
    newMail.content = this.getMessageHistory(previousMails);
    newMail.mailbox = this.mailboxes.find(mailbox => allRecipients.has(mailbox.email)).id;
    if (mail.reply_to && mail.reply_to.length > 0) {
      newMail.receiver = mail.reply_to;
    } else {
      let lastSender = '';
      let lastReceiver = '';
      if (mail.children && mail.children.length > 0) {
        for (let i = mail.children.length; i > 0; i--) {
          if (mail.children[i - 1].folder !== 'trash') {
            lastSender = mail.children[i - 1].sender;
            lastReceiver = mail.children[i - 1].receiver[0];
            break;
          }
        }
        if (lastSender && lastReceiver) {
          newMail.receiver = lastSender !== this.currentMailbox.email ? [lastSender] : [lastReceiver];
        } else {
          newMail.receiver = mail.sender !== this.currentMailbox.email ? [mail.sender] : this.mail.receiver;
        }
      } else {
        newMail.receiver = mail.sender !== this.currentMailbox.email ? [mail.sender] : this.mail.receiver;
      }
    }
    this.selectedMailToInclude = mail;
    newMail.last_action = MailAction.REPLY;
    newMail.is_html = mail.is_html;
    if (!isChildMail && mainReply) {
      if (this.mail.children && this.mail.children.length > 0) {
        newMail.last_action_parent_id = this.mail.children[this.mail.children.length - 1].id;
      } else {
        newMail.last_action_parent_id = this.mail.id;
      }
    } else {
      newMail.last_action_parent_id = mail.id;
    }
    this.composeMailService.openComposeMailDialog({
      draft: { ...newMail },
      action: MailAction.REPLY,
      isFullScreen: this.userState.settings.is_composer_full_screen,
    });
  }

  onReplyAll(mail: Mail, index = 0, isChildMail?: boolean, mainReply = false) {
    const newMail: Mail = {
      content: '',
    };
    const previousMails = this.getPreviousMail(index, isChildMail, mainReply);
    this.composeMailData[mail.id] = {
      subject: `Re: ${mail.subject}`,
      parentId: this.mail.id,
      content: this.getMessageHistory(previousMails),
      selectedMailbox: this.mailboxes.find(mailbox => mail.receiver.includes(mailbox.email)),
    };
    let parentId = this.mail.id;
    if (!this.isConversationView && this.mail.parent) {
      parentId = this.mail.parent;
    }
    newMail.subject = `Re: ${mail.subject}`;
    newMail.parent = parentId;
    newMail.content = this.getMessageHistory(previousMails);
    newMail.mailbox = this.mailboxes.find(mailbox => mail.receiver.includes(mailbox.email)).id;
    if (mail.sender !== this.currentMailbox.email) {
      newMail.receiver = [mail.sender, ...mail.receiver, ...mail.cc, ...mail.bcc];
    } else {
      newMail.receiver = Array.isArray(mail.receiver)
        ? [...mail.receiver, ...mail.cc, ...mail.bcc]
        : [mail.receiver, ...mail.cc, ...mail.bcc];
    }
    newMail.receiver = newMail.receiver.filter((email: string) => email !== this.currentMailbox.email);
    this.selectedMailToInclude = mail;
    newMail.last_action = MailAction.REPLY_ALL;
    newMail.is_html = mail.is_html;
    // this.setActionParent(mail, isChildMail, mainReply);
    if (!isChildMail && mainReply) {
      if (this.mail.children && this.mail.children.length > 0) {
        newMail.last_action_parent_id = this.mail.children[this.mail.children.length - 1].id;
      } else {
        newMail.last_action_parent_id = this.mail.id;
      }
    } else {
      newMail.last_action_parent_id = mail.id;
    }
    this.composeMailService.openComposeMailDialog({
      draft: { ...newMail },
      action: MailAction.REPLY_ALL,
      isFullScreen: this.userState.settings.is_composer_full_screen,
    });
  }

  confirmIncludeAttachments(shouldInclude?: boolean) {
    if (shouldInclude) {
      this.composeMailData[this.selectedMailToInclude.id].forwardAttachmentsMessageId = this.selectedMailToInclude.id;
    }
    this.mailOptions[this.selectedMailToInclude.id].isComposeMailVisible = true;
    this.selectedMailToInclude = null;
    if (this.includeAttachmentsModalRef) {
      this.includeAttachmentsModalRef.dismiss();
    }
  }

  onForward(mail: Mail, index = 0, isChildMail?: boolean, mainReply = false) {
    const newMail: Mail = {
      content: '',
    };
    newMail.content = this.getForwardMessageSummary(mail);
    newMail.subject = `Fwd: ${this.mail.subject}`;
    newMail.mailbox = this.mailboxes.find(mailbox => mail.receiver.includes(mailbox.email)).id;
    newMail.last_action = MailAction.FORWARD;
    newMail.is_html = mail.is_html;
    this.selectedMailToForward = mail;
    // this.setActionParent(mail, isChildMail, mainReply);
    if (!isChildMail && mainReply) {
      if (this.mail.children && this.mail.children.length > 0) {
        newMail.last_action_parent_id = this.mail.children[this.mail.children.length - 1].id;
      } else {
        newMail.last_action_parent_id = this.mail.id;
      }
    } else {
      newMail.last_action_parent_id = mail.id;
    }
    this.currentForwardingNewEmail = newMail;
    if (mail.attachments?.length > 0) {
      this.forwardAttachmentsModalRef = this.modalService.open(this.forwardAttachmentsModal, {
        centered: true,
        windowClass: 'modal-sm users-action-modal',
      });
    } else {
      this.confirmForwardAttachments();
    }
  }

  confirmForwardAttachments(shouldForward?: boolean) {
    if (shouldForward) {
      this.currentForwardingNewEmail.forward_attachments_of_message = this.selectedMailToForward.id;
    }
    this.selectedMailToForward = null;

    if (this.forwardAttachmentsModalRef) {
      this.forwardAttachmentsModalRef.dismiss();
    }
    this.composeMailService.openComposeMailDialog({
      draft: { ...this.currentForwardingNewEmail },
      action: MailAction.REPLY_ALL,
      isFullScreen: this.userState.settings.is_composer_full_screen,
    });
  }

  onComposeMailHide(mail: Mail) {
    this.composeMailData[mail.id] = {};
    this.mailOptions[mail.id].isComposeMailVisible = false;
  }

  onDelete(mail: Mail, index?: number, withChildren = true) {
    if (mail.folder === MailFolderType.TRASH && this.mailFolder === MailFolderType.TRASH) {
      this.store.dispatch(new DeleteMail({ ids: mail.id.toString(), parent_only: !withChildren }));
      if (
        this.mail.children &&
        !this.mail.children.filter(child => child.id !== mail.id).some(child => child.folder === MailFolderType.TRASH)
      ) {
        this.goBackAfterDelete();
      }
    } else {
      this.store.dispatch(
        new MoveMail({
          ids: mail.id,
          folder: MailFolderType.TRASH,
          sourceFolder: mail.folder,
          mail,
          allowUndo: true,
          withChildren,
        }),
      );
      this.onDeleteCollapseMail(mail.id);
    }
    let excepted_children: any[] = [];
    if (this.mail.children) {
      excepted_children =
        this.mailFolder === this.mailFolderTypes.TRASH
          ? this.mail.children.filter(child => child.folder === this.mailFolderTypes.TRASH)
          : this.mail.children.filter(child => child.folder !== this.mailFolderTypes.TRASH);
      excepted_children = excepted_children.filter(child => child.id !== mail.id);
    }
    if (
      (mail.id === this.mail.id && (withChildren || !excepted_children || excepted_children.length === 0)) ||
      (mail.id !== this.mail.id &&
        (!excepted_children || excepted_children.length === 0) &&
        this.mail.folder === MailFolderType.TRASH) ||
      (mail.id === this.mail.id && this.mail.folder === MailFolderType.TRASH)
    ) {
      this.goBackAfterDelete();
    }
  }

  goBackAfterDelete() {
    this.goBack(500);
    this.mail = null;
    this.markedAsRead = false;
  }

  onDeleteForAll(mail: Mail) {
    this.store.dispatch(new DeleteMailForAll({ id: mail.id, isMailDetailPage: true }));
    if (this.mail.children) {
      this.mail.children = this.mail.children.filter(child => child.id !== mail.id);
    }
    if (mail.id === this.mail.id) {
      this.goBackAfterDelete();
    }
  }

  onDeleteCollapseMail(mailID?: number) {
    this.mailExpandedStatus[mailID] = false;
  }

  onMarkAsSpam(mail: Mail) {
    this.store.dispatch(
      new MoveMail({
        ids: mail.id,
        folder: MailFolderType.SPAM,
        sourceFolder: mail.folder,
        mail,
        allowUndo: true,
      }),
    );
    if (mail.id === this.mail.id) {
      this.goBack();
    }
  }

  markNotSpam(mail: Mail) {
    this.store.dispatch(
      new MoveMail({
        ids: mail.id,
        folder: MailFolderType.INBOX,
        sourceFolder: mail.folder,
        mail,
        allowUndo: true,
      }),
    );
    setTimeout(() => {
      this.store.dispatch(new WhiteListAdd({ name: mail.sender, email: mail.sender }));
    }, 2000);
    this.goBack();
  }

  ontoggleStarred(event: any, mail: Mail, withChildren = true) {
    event.stopPropagation();
    event.preventDefault();
    this.store.dispatch(
      new StarMail({
        ids: mail.id.toString(),
        starred: withChildren ? !mail.has_starred_children : !mail.starred,
        withChildren,
      }),
    );
  }

  moveToFolder(folder: MailFolderType | string) {
    // Dispatch move to selected folder event
    this.store.dispatch(
      new MoveMail({
        ids: this.mail.id,
        folder,
        sourceFolder: this.mailFolder,
        allowUndo: true,
        mail: this.mail,
        fromTrash: this.mailFolder === MailFolderType.TRASH,
      }),
    );

    this.goBack(500);
  }

  onCancelSend(mail: any) {
    mail.delayed_delivery = 'CancelSend';
    const updatedMail = { draft: mail };
    this.store.dispatch(new SendMail(updatedMail));

    this.goBack(500);
  }

  goBack(wait = 1) {
    setTimeout(() => {
      this.router.navigateByUrl(`/mail/${this.mailFolder}/page/${this.page}`);
    }, wait);
  }

  openCreateFolderDialog() {
    this.shareService.openCreateFolderDialog(this.userState.isPrime, this.customFolders, {
      self: this,
      method: 'moveToFolder',
    });
  }

  onPrint(mail: Mail) {
    if (this.decryptedContents[mail.id]) {
      let popupWin;

      const subject = document.getElementById(`${this.mail.id}-mail-subject`).innerHTML;
      const from = document.getElementById(`${mail.id}-mail-from`).innerHTML;
      const to = document.getElementById(`${mail.id}-mail-to`).innerHTML;
      const date = document.getElementById(`${mail.id}-mail-date`).innerHTML;
      const content = document.getElementById(`${mail.id}-raw-mail-content`).innerHTML;

      const hasCC = document.getElementById(`${mail.id}-mail-cc`);
      let cc = '';
      if (hasCC) {
        cc = `<span class="text-muted">${hasCC.innerHTML}</span>`;
      }

      popupWin = window.open('', '_blank', 'top=0,left=0,height=100%,width=auto');
      popupWin.document.open();
      popupWin.document.write(`
          <html>
            <head>
              <title>Print tab</title>
              <style>
              body {
                font-family: "Roboto", Helvetica, Arial, sans-serif;
                }

                .navbar-brand-logo {
                    margin-right: 10px;
                    max-width: 32px;
                }

                a {
                    color: #3498db;
                }

                .container {
                    max-width: 900px;
                    padding: 100px 15px;
                    margin: auto;
                    color: #757675;
                }

                .row {
                    padding-left: -15px;
                    padding-right: -15px;
                }

                .text-center {
                    text-align: center;
                }

                .text-secondary {
                    color: #34495e;
                }

                .page-title {
                    font-weight: 300;
                }

                .dashed-separator {
                    border-top: 1px dashed #777;margin:20px 0 20px;
                }
              </style>
            </head>
            <body onload="window.print();window.close()">
            <div class="container">
                <div class="row">
                    <!-- Mail Subject -->
                    <h1>${subject}</h1>
                    <div class="dashed-separator"></div>
                    <!-- Mail From  -->
                    <span class="text-muted">${from}</span>
                    <br>
                    <!-- Mail To  -->
                    <span class="text-muted">${to}</span>
                    <br>
                    <!-- Mail CC  -->
                    ${cc}
                    <br>
                    <!-- Mail Date Created  -->
                    Dated:<strong>${date}</strong>
                    <br>
                    <div class="dashed-separator"></div>
                    <!-- Mail Content  -->
                    <div>
                      ${content}
                    </div>
                </div>
            </div>
            </body>
          </html>`);
      popupWin.document.close();
    }
  }

  scrollTo(elementReference: any) {
    if (elementReference) {
      setTimeout(() => {
        elementReference.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  onSwitchHtmlPlainTextMode(mail: Mail) {
    this.plainTextViewState[mail.id] = !this.plainTextViewState[mail.id];
  }

  private getPreviousMail(index: number, isChildMail: boolean, mainReply = false, isForwarding = false) {
    let children: Mail[] = this.mail.children || [];
    if (this.mailFolder !== MailFolderType.TRASH && this.mail.children) {
      children = this.mail.children.filter(child => child.folder !== MailFolderType.TRASH && child.folder !== MailFolderType.DRAFT);
    }
    const previousMail = [];
    if (isChildMail) {
      previousMail.push(children[index]);
    } else if (mainReply === true && children.length > 0) {
      previousMail.push(children[children.length - 1]);
    } else if (this.mail.folder !== MailFolderType.TRASH && !isForwarding) {
      previousMail.push(this.mail);
    }
    return previousMail;
  }

  private getMessageHistory(previousMails: Mail[]): string {
    if (previousMails.length === 0) {
      return '';
    }
    let history = SummarySeparator;
    previousMails.forEach(previousMail => (history = this.getMessageSummary(history, previousMail)));
    return `<div class="gmail_quote">${history}</div>`;
  }

  /**
   * Add original message status when reply or forward
   */
  private getMessageSummary(content: string, mail: Mail): string {
    if (mail.folder !== MailFolderType.DRAFT && mail.folder !== MailFolderType.TRASH && this.includeOriginMessage) {
      const formattedDateTime = mail.sent_at
        ? this.dateTimeUtilService.formatDateTimeStr(mail.sent_at, 'ddd, MMMM D, YYYY [at] h:mm:ss A')
        : this.dateTimeUtilService.formatDateTimeStr(mail.created_at, 'ddd, MMMM D, YYYY [at] h:mm:ss A');
      if (this.decryptedContents[mail.id] === undefined) {
        this.decryptedContents[mail.id] = '';
      }
      content += `</br>---------- Original Message ----------</br>On ${formattedDateTime} < ${
        mail.sender
      } > wrote:</br><div class="originalblock">${this.decryptedContents[mail.id]}</div></br>`;
    }
    return content;
  }

  /**
   * Add forwarded message summary with original message
   */
  private getForwardMessageSummary(mail: Mail): string {
    let content =
      `</br>---------- Forwarded message ----------</br>` +
      `From: ${EmailFormatPipe.transformToFormattedEmail(
        mail.sender_display.email,
        xss.escapeHtml(mail.sender_display.name),
        true,
      )}</br>` +
      `Date: ${
        mail.sent_at
          ? this.dateTimeUtilService.formatDateTimeStr(mail.sent_at, 'medium')
          : this.dateTimeUtilService.formatDateTimeStr(mail.created_at, 'medium')
      }</br>` +
      `Subject: ${xss.escapeHtml(mail.subject)}</br>` +
      `To: ${mail.receiver_display
        .map(receiver => EmailFormatPipe.transformToFormattedEmail(receiver.email, receiver.name, true))
        .join(', ')}</br>`;

    if (mail.cc.length > 0) {
      content += `CC: ${mail.cc.map(cc => `< ${cc} >`).join(', ')}</br>`;
    }
    content += `</br>${this.decryptedContents[mail.id]}</br>`;
    return content;
  }

  onClickParentHeader() {
    this.mailExpandedStatus[this.mail.id] = !this.mailExpandedStatus[this.mail.id];
    if (
      this.mail.content !== undefined &&
      !this.decryptedContents[this.mail.id] &&
      !this.isDecrypting[this.mail.id] &&
      !this.isPasswordEncrypted[this.mail.id]
    ) {
      this.isDecrypting[this.mail.id] = true;
      this.pgpService.decrypt(this.mail.mailbox, this.mail.id, new SecureContent(this.mail));
    }
  }

  /**
   * @name onClickChildHeader
   * @description This would be called, when hitting the header of child mail. Will change the state of childMailCollapsed by index
   * @params Index of child from mails
   * @returns None
   */
  onClickChildHeader(mail: Mail) {
    if (mail.folder === MailFolderType.DRAFT) {
      if (!this.mailExpandedStatus[mail.id]) {
        this.mailExpandedStatus[mail.id] = !this.mailExpandedStatus[mail.id];
        const onHide$ = new Subject<boolean>();
        onHide$.subscribe(isHide => {
          if (isHide) {
            this.mailExpandedStatus[mail.id] = false;
          }
        });
        this.composeMailService.openComposeMailDialog(
          {
            draft: { ...mail },
            isFullScreen: this.userState.settings.is_composer_full_screen,
          },
          onHide$,
        );
      }
    } else if (!this.isPasswordEncrypted[mail.id]) {
      this.mailExpandedStatus[mail.id] = !this.mailExpandedStatus[mail.id];
      this.decryptChildEmails(mail);
    }
  }

  private onShowTrashRelatedChildren() {
    this.isShowTrashRelatedChildren = !this.isShowTrashRelatedChildren;
  }

  // == Toggle password visibility
  togglePassword(inputID: string): any {
    const input = <HTMLInputElement>document.getElementById(inputID);
    if (!input.value) {
      return;
    }
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}
