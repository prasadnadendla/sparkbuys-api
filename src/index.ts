import fastify from "fastify";
import * as AppConfig from './conf/config.json'
import { setLogger } from "./log";
import { Secret } from "otpauth";
import cors from "@fastify/cors";
const app = fastify({
  logger: { level: "debug" },
  trustProxy: true
})

setLogger(app.log)
import { SignIn, SignInInput, SignInVerify, SignInVerifyInput } from './models/middleware'
import { getTotpInstance, validate } from "./validator";
import { sendOTP } from "./otp/twofactor";
import { getUser, createUser, getGeoLocation, activateUser, saveToken, executeMutation, executeQuery } from './db/queries'
import fastifyMetrics from 'fastify-metrics'
import fastifyJwt from "@fastify/jwt";
import rateLimit from '@fastify/rate-limit'
import { parseErrorMessage } from "./utils"
import { Subscribe, SubscribeInput } from "./models/subscribe";
const corsOrigin = AppConfig.cors;
const corsOptions: { origin: RegExp[] | string[], methods: string[] } = { origin: [], methods: [] };
corsOrigin.origin.forEach((origin, index) => {
  try {
    if (origin.includes("$"))
      corsOptions.origin[index] = new RegExp(origin.replace(/\./g, '\\.'));
    else
      corsOptions.origin[index] = origin;

  } catch (e) { console.warn(e); }
});
corsOptions.methods = corsOrigin.methods
app.register(cors, corsOptions);
app.register(fastifyMetrics, {
  endpoint: '/system/metrics',
})
app.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute'
});
app.register(fastifyJwt, { secret: AppConfig.jwt })

app.addHook("onRequest", async (request, reply) => {
  try {
    if (request.url.includes("/api/") || request.url.includes("/system/")) {
      if (!request.headers.authorization) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      const token = request.headers.authorization.split(" ")[1];
      if (!token) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      if (request.url.includes("/system/") && token !== AppConfig.system_code) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      //TODO: verify token revocation
      await request.jwtVerify()
    }
  } catch (err) {
    reply.send(err)
  }
})

app.get('/system/health', async (request, res) => {
  res.code(200).send({ status: 'ok', uptime: process.uptime() });
})

const statusTracker: any = {};

app.addHook('onResponse', async (request, reply) => {
  const route = (request.routeOptions && request.routeOptions.url) ? request.routeOptions.url : request.url;
  const method = request.method;
  const status = reply.statusCode;

  const key = `${method} ${route}`;

  if (!statusTracker[key]) {
    statusTracker[key] = {};
  }

  if (!statusTracker[key][status]) {
    statusTracker[key][status] = 0;
  }

  statusTracker[key][status]++;
});


app.get('/system/status', async (request, reply) => {
  reply.send(statusTracker);
});

app.get('/', async (request, res) => {
  res.code(200).send({ hello: "What's up" })

})


/**
 * Sign in endpoint
 * This endpoint handles user sign-in by checking if the user exists and sending a OTP code to their email/phone.
 * If the user does not exist, it creates a new user with a generated secret.
 */
app.post("/signin", { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, res) => {
  try {
    const { data, error } = validate(SignIn, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    if (AppConfig.test.active && data.phone === AppConfig.test.phone) {
      res.code(204).send();
      return;
    }
    const payload: SignInInput = data;
    //TODO: check if user exists
    const user = await getUser(payload.phone);
    if (user) {
      const code = getTotpInstance(payload.phone, user.secret).generate();
      sendOTP(payload.phone, code) //send otp

      res.code(204).send();
      return;
    }
    // create new user
    const secret = new Secret().base32
    let location = null;
    try { location = await getGeoLocation(req.ip); } catch (e) { req.log.error(e, "Failed to get geolocation") }
    // create new user
    const newUser = await createUser(payload.phone, secret, location);
    //TODO: create customer in shopify
    if (!newUser) {
      res.status(500).send({ error: "Failed to create account" });
      return;
    }
    const code = getTotpInstance(payload.phone, secret).generate();
    sendOTP(payload.phone, code)
    res.code(204).send();
    return;

  } catch (ex) {
    req.log.error(ex, "failed to process signin")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Verify endpoint
 * This endpoint verifies the OTP code sent to the user's email/phone.
 */
app.post("/verify", { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, res) => {  // endpoint to verify code 
  try {
    const { data, error } = validate(SignInVerify, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    //For testing
    if (AppConfig.test.active && data.phone === AppConfig.test.phone && data.code === AppConfig.test.otp) {
      //TODO: get customer access token from shopify
      const user = await getUser(data.phone);
      const token = app.jwt.sign({ phone: data.phone, uid: user!.id })
      res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      res.header("Pragma", "no-cache")
      res.header("Expires", "0")
      res.send({ token });
      const location = await getGeoLocation(req.ip);
      return
    }
    const { phone, code }: SignInVerifyInput = data;
    const user = await getUser(phone);
    if (!user) {
      res.code(400).send();
      return;
    }
    const valid = getTotpInstance(phone, user.secret).validate({ token: code, window: 1 })
    if (valid == null) { // Invalid Pin
      res.status(401).send({ error: `Invalid Code` })
      return;
    }

    if (!user.is_active) {
      const activated = await activateUser(user.id);
      if (!activated.id) {
        res.status(500).send({ error: "Failed to activate user" });
        return;
      }
    }

    if (user.blocked) {
      res.status(401).send({ error: "Your account is suspended. please contact our support system" });
      return;
    }
    //TODO: customer token from shopify
    const token = app.jwt.sign({ phone: data.phone, uid: user!.id })
    // set no cache 
    res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    res.header("Pragma", "no-cache")
    res.header("Expires", "0")
    res.send({ token });
    const location = await getGeoLocation(req.ip);
    saveToken(user!.id, token, location)
  } catch (ex) {
    req.log.error(ex, "failed to process verify")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/** endpoint for push subscription */

app.post("/api/subscribe", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(Subscribe, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const subscription: SubscribeInput = data;
    try {
      const response = await executeMutation(`mutation createSubscription($object:sb_pushsubs_insert_input!){
      insert_sb_pushsubs_one(object:$object,on_conflict: {constraint: pushsubs_uid_key, update_columns: []}){
        id
      }
    }`, { object: subscription.token ? { uid: user.uid, android_pushsubs: { data: [subscription] } } : { uid: user.uid, web_pushsubs: { data: [subscription] } } });
      if (response.errors || !response.data) {
        res.status(500).send({ error: "Failed to save subscription" });
        return;
      }
    } catch (err: any) {
      if (err.message.includes('cannot proceed to insert array relations since insert to ')) {
        const key = subscription.token ? 'android_pushsubs' : 'web_pushsubs'
        const getSubscriptionId = await executeQuery(`query getpushSubId($uid:uuid!) {
          sb_pushsubs(where:{uid:{_eq:$uid}}){
            id
          }
          }`, { uid: user.uid })
        if (getSubscriptionId.error || getSubscriptionId.errors || getSubscriptionId.data.sb_pushsubs.length == 0) { // this should never happen unless if there's an issue gql server for a while
          res.status(400).send({ error: "Invalid Request" })
          return;
        }
        const pushsub_id = getSubscriptionId.data.sb_pushsubs[0].id
        const response = await executeMutation(`mutation createPushSubscription($object:sb_${key}_insert_input!){
      insert_sb_${key}_one(object:$object){
        id
      }
    }`, { object: { ...subscription, pushsub_id } });
        if (response.errors || !response.data) {
          res.status(500).send({ error: "Failed to save subscription" });
          return;
        }
      }

      res.status(500).send({ error: "Failed to save subscription" });
      return;

    }
    res.code(204).send();
  } catch (ex) {
    const error = parseErrorMessage(ex);
    if (error) { // constraint violation, this means subscription already exists
      res.code(204).send();
      return;
    }
    req.log.error(ex, "failed to subscribe")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

app.listen({ port: AppConfig.port, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err
  app.log.info(`app running at ${address}`)
})
