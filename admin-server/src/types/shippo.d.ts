declare module 'shippo' {
  interface ShipmentAddress {
    name?: string;
    street1: string;
    street2?: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
    email?: string | null;
    phone?: string | null;
  }

  interface ShipmentParcel {
    length: string;
    width: string;
    height: string;
    distance_unit: string;
    weight: string;
    mass_unit: string;
  }

  interface CreateShipmentRequest {
    address_from: ShipmentAddress;
    address_to: ShipmentAddress;
    parcels: ShipmentParcel[];
    async?: boolean;
  }

  interface ShipmentRate {
    object_id: string;
    amount?: string;
  }

  interface ShipmentResponse {
    rates?: ShipmentRate[];
  }

  interface TransactionRequest {
    rate: string;
    label_file_type?: string;
    async?: boolean;
  }

  interface TransactionResponse {
    status: string;
    tracking_number?: string;
    label_url?: string;
    messages?: unknown;
  }

  interface ShippoClient {
    shipment: {
      create(request: CreateShipmentRequest): Promise<ShipmentResponse>;
    };
    transaction: {
      create(request: TransactionRequest): Promise<TransactionResponse>;
    };
  }

  type ShippoInit = string | { shippoToken: string };

  function shippo(token: ShippoInit): ShippoClient;

  export default shippo;
}
