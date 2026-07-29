---
title: Amazon Bedrock
description: Configuring the Amazon Bedrock Chat Model in AIRI
---

Amazon Bedrock uses a Bedrock API key and AWS region to access authorized base models.

::: info Why choose Amazon Bedrock?
If you already manage model access, regions, and billing in AWS, Bedrock can use this same account management approach.
:::

## Prepare a Bedrock API key

1. Open the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/), enable access to the required model, and create a Bedrock API key for the same account and region.

::: warning AWS Credential Security
Do not expose the Bedrock API key. Store it only in AIRI's provider settings and revoke it when no longer needed.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Amazon Bedrock**, enter the **Amazon Bedrock API Key**, and enter the **AWS Region**; the default region is `us-east-1`.
2. Confirm that the AWS account has access to the target model in that region. The AIRI form has no custom endpoint field.

## Verify configuration

1. Wait for AIRI's automatic validation after entering the API key and region.
2. Go to **Settings → Modules → Consciousness**, select Amazon Bedrock and an authorized model, then send a message to verify the configuration.

## Troubleshooting

When verification fails, check that the AWS credentials, selected region, and model access belong to the same account. When the model cannot be selected, first apply for and activate the corresponding model for the area in the Bedrock console.
