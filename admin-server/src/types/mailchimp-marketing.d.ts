declare module '@mailchimp/mailchimp_marketing' {
  interface MailchimpConfig {
    apiKey: string;
    server: string;
  }

  interface MailchimpListMember {
    email_address: string;
    status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
    status_if_new?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
    merge_fields?: Record<string, unknown>;
  }

  interface MailchimpSmsContact {
    phone_number: string;
    email_address?: string;
    status?: 'subscribed' | 'unsubscribed' | 'pending';
    merge_fields?: Record<string, unknown>;
  }

  interface MailchimpListsApi {
    addListMember(listId: string, member: MailchimpListMember): Promise<unknown>;
    setListMember(listId: string, subscriberHash: string, member: MailchimpListMember): Promise<unknown>;
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

  interface MailchimpSmsCampaignApi {
    addContact(audienceId: string, contact: MailchimpSmsContact): Promise<unknown>;
  }

  interface MailchimpClient {
    setConfig(config: MailchimpConfig): void;
    lists: MailchimpListsApi;
    customerJourneys: MailchimpCustomerJourneysApi;
    smsCampaigns?: MailchimpSmsCampaignApi;
  }

  const mailchimp: MailchimpClient;
  export default mailchimp;
}
