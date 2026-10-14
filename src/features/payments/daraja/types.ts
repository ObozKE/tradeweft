export interface DarajaTokenResponse {
  access_token: string;
  expires_in: string;
}

export interface DarajaStkProcessRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  Amount: string | number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface DarajaStkProcessResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface DarajaStkQueryRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  CheckoutRequestID: string;
}

export interface DarajaStkQueryResponse {
  ResponseCode: string;
  ResponseDesc: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string | number;
  ResultDesc: string;
  MpesaReceiptNumber?: string;
}

export interface NormalizedDarajaQueryResult {
  isFinal: boolean;
  isSuccess: boolean;
  resultCode: number;
  resultDesc: string;
  receiptNumber?: string;
  userMessage: string;
}
