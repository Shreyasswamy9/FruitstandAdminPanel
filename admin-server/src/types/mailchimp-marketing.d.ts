declare module '@mailchimp/mailchimp_marketing' {
  interface MailchimpConfig {
    apiKey: string;
    server: string;
  }

  interface MailchimpListMember {
    email_address: string;
    status: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
    merge_fields?: Record<string, unknown>;
  }

  interface MailchimpListsApi {
    addListMember(listId: string, member: MailchimpListMember): Promise<unknown>;
  }

  interface MailchimpClient {
    setConfig(config: MailchimpConfig): void;
    lists: MailchimpListsApi;
  }

  const mailchimp: MailchimpClient;
  export default mailchimp;
}
