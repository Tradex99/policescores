// playwright-audius-full.js
// Usage: node playwright-audius-full.js

const { firefox } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

(async () => {
  try {
    // --- Load user agents ---
    const uaFile = 'user_agents.txt';
    if (!fs.existsSync(uaFile)) throw new Error(`Missing ${uaFile}`);
    const userAgents = fs.readFileSync(uaFile, 'utf8')
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (userAgents.length === 0) throw new Error(`No user agents found in ${uaFile}`);
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    console.log('Selected User-Agent:', randomUA);

    // --- Create new tempmail account ---
    console.log('Creating tempmail account...');
    const pyOut = execSync('python3 tempmail.py new', { encoding: 'utf8' }).trim();
    const lines = pyOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('Invalid output from tempmail.py');
    const [email, password] = lines;
    console.log(`Temp account -> ${email} / ${password}`);

    // --- Extract handle from email ---
    const handle = email.split('@')[0];
    console.log(`Generated handle: ${handle}`);

    // --- Generate image ---
    console.log('Generating profile image...');
    const imgOut = execSync('python3 img.py', { encoding: 'utf8' }).trim();
    const imgMatch = imgOut.match(/Image saved as:\s*(.+)$/);
    if (!imgMatch) throw new Error('Image path not found in img.py output');
    const imagePath = imgMatch[1].trim();
    console.log(`Profile image path: ${imagePath}`);

    // --- Launch Firefox with custom UA ---
    const browser = await firefox.launch({ headless: false });
    const context = await browser.newContext({ userAgent: randomUA });
    const page = await context.newPage();

    // --- Step 1: Open signup page ---
    const signupUrl = 'https://audius.co/signup/create-email';
    console.log(`Navigating to ${signupUrl}...`);
    await page.goto(signupUrl, { waitUntil: 'load', timeout: 60000 });

    // --- Step 2: Fill Email and click submit ---
    const emailSelector = 'input[aria-label="Email"][name="email"]';
    const firstButtonXpath = '/html/body/div[1]/div[1]/div/div[1]/form/div[4]/button';

    await page.waitForSelector(emailSelector, { state: 'visible', timeout: 20000 });
    await page.fill(emailSelector, email);
    console.log('Email filled.');
    await page.click(`xpath=${firstButtonXpath}`);
    console.log('Clicked first signup button.');

    // --- Step 3: Password page ---
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
    const passwordSelector = 'input[aria-label="Password"][name="password"]';
    const confirmSelector = 'input[aria-label="Confirm Password"][name="confirmPassword"]';
    const finalButtonXpath = '/html/body/div[1]/div[1]/div/div[1]/form/div[3]/button';

    await page.waitForSelector(passwordSelector, { state: 'visible', timeout: 20000 });
    await page.fill(passwordSelector, password);
    await page.fill(confirmSelector, password);
    console.log('Password and confirm password filled.');
    await page.click(`xpath=${finalButtonXpath}`);
    console.log('Clicked password submit.');

    // --- Step 4: Handle page ---
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
    const handleSelector = 'input[aria-label="Handle"][name="handle"]';
    const handleButtonXpath = '/html/body/div[1]/div[1]/div/div[1]/form/div[2]/button';

    await page.waitForSelector(handleSelector, { state: 'visible', timeout: 20000 });
    await page.fill(handleSelector, handle);
    console.log('Handle filled.');
    await page.click(`xpath=${handleButtonXpath}`);
    console.log('Clicked handle submit.');

    // --- Step 5: Upload image & set display name ---
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });

    // Click the visible upload button to reveal file dialog
    const uploadButtonSelector = 'button[aria-label="Upload a profile photo"]';
    await page.waitForSelector(uploadButtonSelector, { state: 'visible', timeout: 20000 });
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click(uploadButtonSelector)
    ]);
    await fileChooser.setFiles(imagePath);
    console.log('Profile image uploaded via upload button.');

    // Display name input
    const displayNameSelector = 'input[aria-label="Display Name"][name="displayName"]';
    await page.waitForSelector(displayNameSelector, { state: 'visible', timeout: 20000 });
    await page.fill(displayNameSelector, handle);
    console.log('Display name set.');

    // Click continue
    const continueXpath = '/html/body/div[1]/div[1]/div/div[1]/form/div[2]/div/button[2]';
    await page.click(`xpath=${continueXpath}`);
    console.log('Clicked continue after display name.');

    // --- Step 6: Final confirmation screens ---
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });

    const nextButtonXpath = '/html/body/div[1]/div[1]/div/div[1]/div[2]/form/div[2]/div/button[1]';
    await page.click(`xpath=${nextButtonXpath}`);
    console.log('Clicked next setup button.');

    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
    const doneButtonXpath = '/html/body/div[1]/div[1]/div/div[1]/div[2]/div[2]/button';
    await page.click(`xpath=${doneButtonXpath}`);
    console.log('Clicked final Done button.');

    // --- Complete ---
    console.log(`🎉🎉🎉 Account fully created and profile setup complete:
Email: ${email}
Password: ${password}
Handle: ${handle}
Image: ${imagePath}`);

    // ✅ --- Step 7: Update tempmail_accounts.json ---
    const accountsFile = 'tempmail_accounts.json';
    if (fs.existsSync(accountsFile)) {
      const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));

      if (data[email]) {
        data[email].register = "yes";
      } else {
        data[email] = { address: email, password, register: "yes" };
      }

      fs.writeFileSync(accountsFile, JSON.stringify(data, null, 2));
      console.log(`✅ Updated ${accountsFile}: marked ${email} as registered.`);
    } else {
      console.warn(`⚠️ ${accountsFile} not found. Creating new one...`);
      const newData = {
        [email]: { address: email, password, register: "yes" }
      };
      fs.writeFileSync(accountsFile, JSON.stringify(newData, null, 2));
      console.log(`✅ Created ${accountsFile} with new entry.`);
    }

    // Wait briefly before closing
    await new Promise(r => setTimeout(r, 20000));

    await browser.close();
    console.log('Browser closed. Script finished successfully.');

  } catch (err) {
    console.error('🤦 Error:', err.message || err);
    process.exit(1);
  }
})();