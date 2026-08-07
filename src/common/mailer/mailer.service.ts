import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import Email = require('email-templates');

export interface MailAttachment {
	filename?: string;
	path: string;
	contentType?: string;
}

export interface MailSendOptions {
	attachments?: MailAttachment[];
}

@Injectable()
export class MailerService implements OnModuleInit {
	private readonly logger = new Logger(MailerService.name);
	private transporter?: nodemailer.Transporter;
	private renderer?: Email;
	private from = '';
	private templatesRoot = '';
	private baseLayoutPath = '';

	constructor(private readonly config: ConfigService) {}

	onModuleInit(): void {
		this.templatesRoot = path.join(__dirname, 'templates');
		this.baseLayoutPath = path.join(this.templatesRoot, 'layout', '_base.ejs');

		this.renderer = new Email({
			views: {
				root: this.templatesRoot,
				options: { extension: 'ejs' },
			},
			juice: false,
			send: false,
			preview: false,
		});

		const host = this.config.get<string>('SMTP_HOST');
		const port = Number(this.config.get<string>('SMTP_PORT') || 587);
		const user = this.config.get<string>('SMTP_USER');
		const pass = this.config.get<string>('SMTP_PASSWORD');
		const secure = String(this.config.get<string>('SMTP_SECURE') || 'false').toLowerCase() === 'true';
		this.from = this.config.get<string>('SMTP_FROM') || user || 'no-reply@example.com';

		if (!host || !user || !pass) {
			this.logger.warn(
				'SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing). Emails will be logged to console instead of being sent.',
			);
			return;
		}

		this.transporter = nodemailer.createTransport({
			host,
			port,
			secure,
			auth: { user, pass },
		});
		this.logger.log(`Mailer ready — sending as "${this.from}" via ${host}:${port} (secure=${secure}).`);
	}

	/**
	 * Render <template>/subject.ejs and <template>/html.ejs, wrap the body in
	 * the shared base layout, and send. Falls back to console logging when
	 * SMTP is not configured. Template locals are passed straight into ejs.
	 */
	async sendTemplate(
		to: string,
		templateName: string,
		locals: Record<string, any>,
		options: MailSendOptions = {},
	): Promise<void> {
		if (!this.renderer) throw new Error('Mailer renderer not initialized.');
		const [subject, bodyHtml] = await Promise.all([
			this.renderer.render(`${templateName}/subject`, locals),
			this.renderer.render(`${templateName}/html`, locals),
		]);
		const cleanSubject = subject.trim();
		const html = this.wrapInBaseLayout(cleanSubject, bodyHtml);
		await this.rawSend(to, cleanSubject, html, undefined, options.attachments);
	}

	/**
	 * Escape hatch for callers that already have a fully-rendered HTML body.
	 * Prefer sendTemplate() for anything new.
	 */
	async send(to: string, subject: string, html: string, text?: string, options: MailSendOptions = {}): Promise<void> {
		await this.rawSend(to, subject, html, text, options.attachments);
	}

	private wrapInBaseLayout(subject: string, body: string): string {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const ejs = require('ejs');
			const layoutSrc = fs.readFileSync(this.baseLayoutPath, 'utf8');
			return ejs.render(layoutSrc, { subject, body });
		} catch (err: any) {
			this.logger.warn(`Base layout render failed (${err?.message}); using raw body.`);
			return body;
		}
	}

	private async rawSend(
		to: string,
		subject: string,
		html: string,
		text?: string,
		attachments?: MailAttachment[],
	): Promise<void> {
		const plainText = text ?? html.replace(/<[^>]+>/g, '');
		if (!this.transporter) {
			this.logger.warn(`[STUB EMAIL] to=${to} subject="${subject}"`);
			if (attachments?.length) {
				this.logger.warn(`[STUB EMAIL] attachments=${attachments.map((a) => a.filename || a.path).join(', ')}`);
			}
			this.logger.warn(plainText);
			return;
		}
		try {
			const info = await this.transporter.sendMail({
				from: this.from,
				to,
				subject,
				html,
				text: plainText,
				attachments,
			});
			this.logger.log(`Sent email to=${to} subject="${subject}" messageId=${info.messageId}`);
		} catch (err: any) {
			this.logger.error(
				`Failed to send email to=${to} subject="${subject}": ${err?.message}`,
				err?.stack,
			);
			throw err;
		}
	}
}
