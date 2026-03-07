
import { ApolloClient, gql, InMemoryCache, HttpLink } from "@apollo/client/core"
import * as AppConfig from '../conf/config.json';
import { getLogger } from "../log"
import { toSnakeCase } from "../validator";
const log = getLogger();
const client = new ApolloClient({
    link: new HttpLink({
        uri: AppConfig.graphql.endpoint,
        headers: {
            "x-hasura-admin-secret": `${AppConfig.secretKey}`
        }
    }),
    cache: new InMemoryCache(), //disable cache by using a fresh instance
    defaultOptions: {
        watchQuery: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'ignore',
        },
        query: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'all',
        },
    }
});

export const getUser = async (phoneNumber: string) => {
    const response = await client.query({
        query: gql`query getUser($phone: String!) {
                sb_users(where: {phone: {_eq: $phone}}) {
                    id
                    secret
                    is_active
                    blocked
                    terms_accepted
                    name
                    email
                    is_deleted
                    roles
                }
                }`,
        variables: { phone: phoneNumber }
    })

    return (response as any).data.sb_users[0] || null;
}

export const getUserById = async (userId: string) => {
    const response = await client.query({
        query: gql`query getUser($id: uuid!) {
                sb_users_by_pk(id: $id) {
                    id
                    secret
                    is_active
                    blocked
                    terms_accepted
                    name
                    email
                    is_deleted
                    roles
                }
                }`,
        variables: { id: userId }
    })

    return (response as any).data.sb_users_by_pk || null;
}


export const createUser = async (phoneNumber: string, secret: string, location: any) => {
    const response = await client.mutate({
        mutation: gql`mutation createUser($object: sb_users_insert_input!) {
                insert_sb_users_one(object: $object) {  
                        id   
                }
            }`,
        variables: { object: { phone: phoneNumber, secret, name: "Unknown", location, city: location?.city, state: location?.state } }
    })
    //TODO: add new user to cache?
    return (response as any).data.insert_sb_users_one.id || null;
}

export const activateUser = async (userId: string) => {
    const response = await client.mutate({
        mutation: gql`mutation activateUser($id: uuid!) {
                update_sb_users_by_pk(pk_columns: {id: $id}, _set: {is_active: true}) {
                    id                    
                    terms_accepted
                }
            }`,
        variables: { id: userId }
    })
    return (response as any).data.update_sb_users_by_pk || null;
}

export const updateUserProfile = async (name: string, purpose: string[], userId: string, details?: any) => {
    const set: any = { name, roles: purpose };
    if (details && purpose.includes("Developer")) {
        if (details.logo) set.image = details.logo
        if (details.location) set.city = details.location
        if (details.founded) set.founded_year = details.founded
    }
    const response = await client.mutate({
        mutation: gql`mutation updateUserProfile($id: uuid!, $set: sb_users_set_input!) {
            update_sb_users_by_pk(pk_columns: {id: $id}, _set: $set) {
                id
            }
            }`,
        variables: { id: userId, set }
    })
    return (response as any).data.update_sb_users_by_pk || null;
}

export const updateUserDetails = async (name: string, email: string, userId: string) => {
    const response = await client.mutate({
        mutation: gql`mutation updateUserProfile($id: uuid!, $set: sb_users_set_input!) {
                update_sb_users_by_pk(pk_columns: {id: $id}, _set: $set) {
                    id                    
                }
            }`,
        variables: { id: userId, set: email ? { name, email } : { name } }
    })
    return (response as any).data.update_sb_users_by_pk || null;
}

export const deleteUser = async (userId: string) => {
    const response = await client.mutate({
        mutation: gql`mutation deleteUser($id: uuid!) {
                update_sb_users_by_pk(pk_columns:{id: $id}, _set: {is_deleted: true}) {
                    id                    
                }
            }`,
        variables: { id: userId }
    })
    return (response as any).data.update_sb_users_by_pk || null;
}


export const saveToken = async (userId: string, token: string, location: any) => {
    const response = await client.mutate({
        mutation: gql`mutation saveToken($object: sb_tokens_insert_input!) {
                insert_sb_tokens_one(object: $object) {  
                        id   
                }
            }`,
        variables: { object: { uid: userId, token, location } }
    })
    return (response as any).data.insert_sb_tokens_one.id || null;
}

export const executeQuery = async (query: string, variables: any = {}) => {
    try {
        const response = await client.query({
            query: gql`${query}`,
            variables: toSnakeCase(variables)
        });
        return response as any;
    } catch (error: any) {
        log.error(`Error executing query: ${error.message}`);
        throw error;
    }
}

export const executeMutation = async (mutation: string, variables: any = {}) => {
    try {
        const response = await client.mutate({
            mutation: gql`${mutation}`,
            variables: toSnakeCase(variables, 1)
        });
        return response as any;
    } catch (error: any) {
        log.error(`Error executing mutation: ${error.message}`);
        throw error;
    }
}
// src/db/queries.ts

/**
 * 
 * @param ip
 * @returns {Promise<any>}
 */

export async function getGeoLocation(ip: string) {
    try {
        const url = `http://${AppConfig['ipinfo'].domain}/json/${ip}?fields=status,message,countryCode,region,city,zip,lat,lon,timezone,offset,currency,isp,org,as,mobile,proxy,hosting,query`;
        const response = await fetch(url, { method: "GET" });
        return await response.json();
    } catch (ex: any) {
        log.error(`Unable to get country info for ${ip}. details ${ex.message}`)
    }
}

