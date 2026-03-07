import * as AppConfig from './conf/config.json';
import { getLogger } from './log';

const log = getLogger();
const SHOPIFY_API_VERSION = '2026-01';
const BASE_URL = `https://${AppConfig.shopify.storeUrl}/admin/api/${SHOPIFY_API_VERSION}`;
const ADMIN_HEADERS = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': AppConfig.shopify.adminToken,
};
const STOREFRONT_HEADERS = {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': AppConfig.shopify.storefrontToken,
};

interface ShopifyCustomer {
    id: number;
    phone: string;
    email?: string;
}

interface CustomerAccessToken {
    accessToken: string;
    expiresAt: string;
}

/** Derives a consistent synthetic email from a phone number. */
function syntheticEmail(phone: string): string {
    return phone.replace(/\D/g, '') + '@customers.sparkbuys.in';
}

async function findCustomerByPhone(phone: string): Promise<ShopifyCustomer | null> {
    const url = `${BASE_URL}/customers/search.json?query=phone:${encodeURIComponent(phone)}&limit=1&fields=id,phone,email`;
    const res = await fetch(url, { headers: ADMIN_HEADERS });
    if (!res.ok) {
        log.error(`Shopify customer search failed: ${res.status} ${await res.text()}`);
        return null;
    }
    const json = await res.json() as { customers: ShopifyCustomer[] };
    return json.customers?.[0] ?? null;
}

async function createShopifyCustomer(phone: string, secret: string): Promise<ShopifyCustomer | null> {
    const email = syntheticEmail(phone);
    const res = await fetch(`${BASE_URL}/customers.json`, {
        method: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
            customer: {
                phone,
                email,
                password: secret,
                password_confirmation: secret,
                tags: 'otp-app',
                verified_email: false,
            },
        }),
    });
    if (!res.ok) {
        log.error(`Shopify customer create failed: ${res.status} ${await res.text()}`);
        return null;
    }
    const json = await res.json() as { customer: ShopifyCustomer };
    return json.customer ?? null;
}

/**
 * Find or create a Shopify customer for the given phone number.
 * Uses `secret` as the customer password so we can generate access tokens
 * later without storing an additional credential.
 * Returns the Shopify customer ID, or null on failure.
 */
export async function createOrGetShopifyCustomer(phone: string, secret: string): Promise<number | null> {
    try {
        const existing = await findCustomerByPhone(phone);
        if (existing) return existing.id;
        const created = await createShopifyCustomer(phone, secret);
        return created?.id ?? null;
    } catch (err) {
        log.error(err, 'createOrGetShopifyCustomer failed');
        return null;
    }
}

/**
 * Generate a Shopify Storefront customer access token.
 * Uses the synthetic email + the user's TOTP secret as credentials.
 * Returns null if the customer doesn't exist in Shopify yet.
 */
export async function getCustomerAccessToken(phone: string, secret: string): Promise<CustomerAccessToken | null> {
    try {
        const email = syntheticEmail(phone);
        const mutation = `
            mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
                customerAccessTokenCreate(input: $input) {
                    customerAccessToken { accessToken expiresAt }
                    customerUserErrors { code message }
                }
            }
        `;
        const res = await fetch(`https://${AppConfig.shopify.storeUrl}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: STOREFRONT_HEADERS,
            body: JSON.stringify({ query: mutation, variables: { input: { email, password: secret } } }),
        });
        if (!res.ok) {
            log.error(`Shopify Storefront API error: ${res.status}`);
            return null;
        }
        const json = await res.json() as any;
        const errors = json?.data?.customerAccessTokenCreate?.customerUserErrors;
        if (errors?.length) {
            log.error({ errors }, 'customerAccessTokenCreate returned errors');
            return null;
        }
        return json?.data?.customerAccessTokenCreate?.customerAccessToken ?? null;
    } catch (err) {
        log.error(err, 'getCustomerAccessToken failed');
        return null;
    }
}
