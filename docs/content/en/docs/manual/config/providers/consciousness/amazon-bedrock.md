---
title: Amazon Bedrock
description: Configure Amazon Bedrock chat models in AIRI
---


Amazon Bedrock uses AWS credentials and a region to access foundation models you have been granted access to.


::: info Why choose Amazon Bedrock?


If you already manage model access, regions, and billing in AWS, Bedrock lets you reuse that same account management approach.


:::


## Step 1: Prepare AWS Credentials


1. Open and sign in to the [AWS Management Console](https://console.aws.amazon.com/bedrock/) and create access credentials with Bedrock permissions.


::: warning AWS Credential Security


Do not expose AWS access keys publicly. Use credentials with minimal permissions and revoke them when no longer in use.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Amazon Bedrock**, fill in the AWS **API Key**, and select a region; the default region is `us-east-1`.
2. Confirm the AWS account has been granted access to the target model in the corresponding region. Only fill in a custom address when using a custom Bedrock Endpoint.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether the credentials, region, and network are correct.
2. **Select Model**: after the test succeeds, choose a model the account is authorized to use, then enable it under **Settings → Consciousness**.


## Troubleshooting


If verification fails, check that the AWS credentials, selected region, and model access permissions belong to the same account. If a model cannot be selected, first request and enable the corresponding model for that region in the Bedrock console.

