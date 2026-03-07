# sparkbuys-api

docker build -t truelet/sparkbuys-api:v1 .



# Step 1: User visits this URL in browser (not curl) to authorize
https://sparkbuys26.myshopify.com/admin/oauth/authorize?\
  client_id=dc5894300a07b7aa33f5c0cd3e80f42c&\
  scope=read_customers,write_customers&\
  redirect_uri=https://localhost/redirect&\
  state=random_nonce

# Step 2: Exchange the code you receive at redirect_uri for a token
curl -X POST "https://sparkbuys26.myshopify.com/admin/oauth/access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "dc5894300a07b7aa33f5c0cd3e80f42c",
    "client_secret": "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",
    "code": "c4a9526a777812631ec2fa68d7383887"
  }'
