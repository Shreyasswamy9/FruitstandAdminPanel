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

  interface MailchimpCustomerJourneysTriggerEvent {
    name?: string;
    properties?: Record<string, unknown>;
  }

  interface MailchimpCustomerJourneysTriggerPayload {
    email_address?: string;
    contact_id?: string;
    event?: MailchimpCustomerJourneysTriggerEvent;
  }

  interface MailchimpCustomerJourneysApi {
    trigger(journeyId: string, stepId: string, payload: MailchimpCustomerJourneysTriggerPayload): Promise<unknown>;
  }

  interface MailchimpClient {
    setConfig(config: MailchimpConfig): void;
    lists: MailchimpListsApi;
    customerJourneys: MailchimpCustomerJourneysApi;
  }

  const mailchimp: MailchimpClient;
  export default mailchimp;
}
