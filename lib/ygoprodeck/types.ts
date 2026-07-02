export interface YgoCardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code: string;
  set_price: string;
}

export interface YgoCardImage {
  id: number;
  image_url: string;
  image_url_small: string;
  image_url_cropped?: string;
}

export interface YgoCardPrice {
  cardmarket_price?: string;
  tcgplayer_price?: string;
  ebay_price?: string;
  amazon_price?: string;
  coolstuffinc_price?: string;
}

export interface YgoBanlistInfo {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
}

export interface YgoCard {
  id: number;
  name: string;
  type: string;
  frameType?: string;
  desc: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  atk?: number;
  def?: number;
  level?: number;
  linkval?: number;
  linkmarkers?: string[];
  scale?: number;
  banlist_info?: YgoBanlistInfo;
  card_sets?: YgoCardSet[];
  card_images?: YgoCardImage[];
  card_prices?: YgoCardPrice[];
}

export interface YgoCardInfoResponse {
  data: YgoCard[];
}

export interface YgoDbVersion {
  database_version: string;
  last_update: string;
}
