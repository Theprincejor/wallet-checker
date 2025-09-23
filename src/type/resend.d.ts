declare module 'resend' {
  interface ResendOptions {
    apiKey: string;
  }

  class Resend {
    constructor(apiKey: string);
    sendEmail(options: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }): Promise<any>;
  }

  export { Resend };
}
