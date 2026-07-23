import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import type { FactoryProvider } from '@nestjs/common';

export const SEND_EMAIL_TOOL = 'SEND_EMAIL_TOOL';

export const sendEmailToolProvider: FactoryProvider = {
  provide: SEND_EMAIL_TOOL,
  useFactory: (mailerService: MailerService, configService: ConfigService) => {
    return tool(
      async ({
        to,
        subject,
        body,
        text,
      }: {
        to: string;
        subject: string;
        body?: string;
        text?: string;
      }) => {
        const fallbackForm = configService.get<string>('MAIL_FORM');
        await mailerService.sendMail({
          to,
          subject,
          html: body ?? '(无HTML内容)',
          text: text ?? '(无文本内容)',
          from: fallbackForm,
        });
        return `邮件发送成功，收件人：${to}，主题：${subject}`;
      },
      {
        name: 'send_mail',
        description: '发送邮件',
        schema: z.object({
          to: z.string().email().describe('收件人邮箱，例如：test@example.com'),
          subject: z.string().describe('邮件主题'),
          body: z.string().optional().describe('HTML内容，可选'),
          text: z.string().optional().describe('纯文本内容，可选'),
        }),
      },
    );
  },
  inject: [MailerService, ConfigService],
};
