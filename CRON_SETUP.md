# Setting up 15-Minute Syncs on Vercel Hobby (Free)

Vercel Hobby accounts are limited to 1 cron job per day. To maintain **15-minute autonomous syncs** for SeplorX without upgrading to a Pro plan, follow these steps to use a free external trigger.

## 1. Get your Sync URL
Your sync entry point is:
`https://x.seplor.com/api/cron/order-sync`

## 2. Setup at Cron-job.org (Recommended)
1.  Go to [cron-job.org](https://cron-job.org/) and create a free account.
2.  Click **"Create Cronjob"**.
3.  **Title**: SeplorX Order Sync
4.  **URL**: Paste your Sync URL from Step 1.
5.  **Schedule**: Select "Every 15 minutes".
6.  **Advanced - HTTP Headers**: 
    - Click "Add header"
    - Key: `Authorization`
    - Value: `Bearer YOUR_CRON_JOB_KEY` (Match the secret in your `.env.local` or Vercel ENV)
7.  **Click Create**.

## 3. Verify in SeplorX
- Once enabled, wait 15 minutes.
- Check your **All Sales Orders** dashboard.
- You should see the **"Synced about 15 minutes ago"** status update automatically across all your channels.

## Security Note
This ensures your `CRON_JOB_KEY` is passed securely via the header, so only the authorized pinger (and you) can trigger a full background sync.
