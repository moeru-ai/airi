---
title: Amazon Bedrock
description: Configuring the Amazon Bedrock Chat Model in AIRI
---

Amazon Bedrock uses AWS credentials and region to access authorized base models.

::: info Why choose Amazon Bedrock?
If you already manage model access, regions, and billing in AWS, Bedrock can use this same account management approach.
:::

## Step One: Prepare AWS Credentials

1. Open and sign in to the [AWS Management Console](https://console.aws.amazon.com/bedrock/), then create access credentials with Bedrock permissions.

::: warning AWS Credential Security
Don't expose AWS access keys. Use credentials with minimal privileges and revoke them when no longer in use.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Amazon Bedrock**, fill in the AWS **API Key**, and select the region; the default region is `us-east-1`.
2. Confirm that the AWS account has gained access to the target model in the corresponding region. Only fill in the custom address if using a custom Bedrock Endpoint.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test that the credentials, region, and network are correct.
2. **Select model**: After the test is successful, select the model for which the account has been authorized, and then go to **Settings → Awareness** to enable it.

## Troubleshooting

When verification fails, check that the AWS credentials, selected region, and model access belong to the same account. When the model cannot be selected, first apply for and activate the corresponding model for the area in the Bedrock console.
