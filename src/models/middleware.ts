import { email, z } from "zod/v4";

const phoneRegex = /^\+91\d{10}$/;

export const SignIn = z.object({
  phone: z.string().regex(phoneRegex, { message: "Invalid phone number format" }),
});

export const SignInVerify = z.object({
  phone: z.string().regex(phoneRegex, { message: "Invalid phone number format" }),
  code: z.string().trim().length(6, { message: "Code must be 6 characters long" })
});



export type SignInInput = z.infer<typeof SignIn>
export type SignInVerifyInput = z.infer<typeof SignInVerify>

