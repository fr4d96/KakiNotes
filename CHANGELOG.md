# Changelog

## [1.0.1](https://github.com/fr4d96/KakiNotes/compare/v1.0.0...v1.0.1) (2026-09-26)


### Bug Fixes

* **stories:** draft delete on reviewed drafts, and saves failing after a photo upload ([eb86d92](https://github.com/fr4d96/KakiNotes/commit/eb86d92e41251be99944b9d0ac93c73e0f71b691))

## [1.0.0](https://github.com/fr4d96/KakiNotes/compare/v0.10.0...v1.0.0) (2026-09-24)

### What's new for everyone

**Stories keep their line breaks.** If a writer pressed Enter once between lines, the published story used to join those lines into one long paragraph. Stories now keep their line breaks exactly as the writer saw them in the editor. This applies to stories that are already published too, so some older stories will now show line breaks where they used to run together.

### What's new for contributors

**Bold and italic switch off again.** Clicking Bold on a word that's already bold now takes the bold off. Before, a second click added more formatting instead of removing it, so the word stayed bold no matter how often you clicked. Italic and strikethrough work the same way, and making bold text italic now gives you bold and italic together.

**The editor looks more like a normal document.** The formatting symbols (the stars around a bold word, the # in front of a heading, the - in front of a bullet point) now stay hidden unless your cursor is right inside that bit of formatting. Before, clicking anywhere on a line showed every symbol on that line at once.

**The review screen matches what you wrote.** The line breaks you type in the editor now show up on the review screen before you submit, instead of everything being squashed into one block.

**A "Free" travel style.** If you travelled by working for your food and bed, house-sitting or hitchhiking, you can now choose "Free" as your travel style, next to the existing options.

**Adding photos no longer loses your writing.** Uploading a photo and going straight back to your story could make the upload fail, or quietly lose the words you had just typed. The photo and your text now save one after the other instead of at the same moment, and if they still happen to clash, the upload tries again instead of giving up.

**No more stuck zoom on iPhone.** Tapping a text box in the story editor on an iPhone used to zoom the whole page in and leave it zoomed. Text boxes are now big enough that iPhones don't zoom. You can still pinch to zoom whenever you want.

**Pressing Done on a photo keeps your place.** On a phone, closing a photo's details after writing its caption used to throw you to the bottom of the page. You now land back on the photo you were describing.

**The editor opens cleanly.** Opening a story to edit it used to make the page flash and ignore your taps for a moment while it rebuilt itself. It now loads in one go.


### Bug Fixes

* **editor:** formatting toggles off, line breaks survive review, Word-like syntax hiding ([0a816d9](https://github.com/fr4d96/KakiNotes/commit/0a816d9ba7fdb2ec965a2fd27bd71f6c03e23f8b))
* **editor:** stop the story-starters card causing a hydration mismatch ([0540504](https://github.com/fr4d96/KakiNotes/commit/0540504110a99ade43edc46c18fdc4ee8aacd39e))
* **mobile:** stop iOS Safari zooming the editor on form fields ([d986830](https://github.com/fr4d96/KakiNotes/commit/d986830c8683ba35ad9d00fe2e6a67647c815fb7))
* **photos:** uploads survive a version clash; caption "Done" keeps your place ([92ec800](https://github.com/fr4d96/KakiNotes/commit/92ec800a473a9d39b6c78ffedf4fb4a930d0e40a))


### Documentation

* **status:** record the 1.0.0 editor and mobile fixes ([33d92a5](https://github.com/fr4d96/KakiNotes/commit/33d92a5ab74e8b037be6097da396a031e1f93bbe))

## [0.10.0](https://github.com/fr4d96/KakiNotes/compare/v0.9.0...v0.10.0) (2026-09-21)

### What's new for contributors

**Tap a photo in the editor to see it big.** The photo tiles in the story editor's Images section used to be small squares you couldn't look at properly. Tap any tile now and the photo opens full-screen — the same viewer readers get on the story page — and you can flick through all your uploaded photos with the arrows, the ← and → keys, or a swipe. The "Details" and "Describe" buttons under each tile work exactly as before.


### Features

* **editor:** photo tiles in the story editor open the full-screen viewer ([c0e9561](https://github.com/fr4d96/KakiNotes/commit/c0e9561c8df87845426dfd9c3ed149608cc903f3))

## [0.9.0](https://github.com/fr4d96/KakiNotes/compare/v0.8.0...v0.9.0) (2026-09-20)

### What's new for everyone

**Tap any photo to see it big.** Photos in a story used to be stuck at the size of the reading column — there was no way to look closer. Now every photo on a story page is tappable. Tap one and it opens on its own, filling the screen on a black background, with a close button in the corner. Tap the black area, press Escape, or hit the ✕ to go back to where you were reading.

**Flick through all the photos in one go.** If a story has more than one photo, the viewer shows "Photo 3 of 12" at the top and lets you move to the next or previous one — with the arrow buttons on either side, the ← and → keys, or by swiping left and right on a phone. It goes through the photos in the story text first, then the ones in the gallery at the bottom, and loops back to the start when you reach the end.

### What's new for contributors

**The same viewer on your preview page.** When you're checking a draft before sending it for review, your photos open in the same full-screen viewer, so you can see exactly what readers will see. Moderators get it on the review page too.


### Features

* **photos:** tap any story photo to view it full-screen, with next/previous ([be8d4e0](https://github.com/fr4d96/KakiNotes/commit/be8d4e0ab7a0a5063153f3e0c45d0c31a8a17009))

## [0.8.0](https://github.com/fr4d96/KakiNotes/compare/v0.7.0...v0.8.0) (2026-09-20)

### What's new for everyone

**Light mode finally looks like the same site as dark mode.** If you use Kakinotes in light mode, the page used to be a warm beige with brown-black text, while dark mode is a deep blue-black with a teal glow. The two didn't match: the dark banner at the top of the home page and the "Share your story" band at the bottom looked pasted in from somewhere else, and the rest of the page came out looking a bit muddy. Light mode now uses the same cool blue-grey family as dark — a soft off-white page, clean white cards, dark blue-black text — so switching between the two feels like the same place in daylight rather than a different website. Text is a touch easier to read too.

**Cards actually look like cards now.** In light mode, the white cards used to sit on an almost-white page with no visible edge, so the stack of featured stories on the home page looked like loose strips instead of a pile. Every card, panel and menu now has a fine outline and a soft shadow underneath it.

**More photo on the featured story.** The big featured story on the home page now gives the photo half the card instead of about a third, so you see more of the picture and less empty space. This applies in both light and dark mode.

**The "where to start reading" answers look clickable.** In light mode the answer boxes in the home-page quiz were flat grey, which looked like disabled buttons. They're now white tiles that lift slightly when you hover over them.


### Features

* **theme:** light mode re-tuned to slate neutrals with real depth ([a8ba2f0](https://github.com/fr4d96/KakiNotes/commit/a8ba2f053c8e5fcd7dd1b47ffe114d2ce6b86459))

## [0.7.0](https://github.com/fr4d96/KakiNotes/compare/v0.6.0...v0.7.0) (2026-09-20)

### What's new for contributors

**You can keep editing a story that's under review.** Until now, once you sent a story for review it was locked until a moderator got to it. Now there's an **Edit anyway** button on the story's preview page, on your My Stories list, and on the editor screen that used to say "not editable". Press it and the story comes out of the review queue and reopens in the editor with everything you wrote, exactly as it was. When you're done, you send it for review again the same way as before. If the story was already published, the version readers can see stays up, unchanged, the whole time — nothing half-edited ever goes live. The button always asks first, so you can't take a story out of review by accident.

### What's new for everyone

**The dead "Destinations" link is gone.** The header and footer had a "Destinations" link that only worked from the home page and did nothing anywhere else. It's been removed; the destination quiz on the home page is still there.


### Features

* **stories:** contributors can keep editing a story that is under review ([1550499](https://github.com/fr4d96/KakiNotes/commit/15504996888dfd39e951a255c15dfc0d7606b301))


### Bug Fixes

* **nav:** remove the Destinations link that went nowhere ([834f56d](https://github.com/fr4d96/KakiNotes/commit/834f56d80941290365ff1a656ea8a3bc202b15c4))

## [0.6.0](https://github.com/fr4d96/KakiNotes/compare/v0.5.0...v0.6.0) (2026-09-16)

### What's new for everyone

**The page now ends where it began.** The dark "Share your story" band at the bottom of the home page used to sit on a stock photograph of a hillside. It now carries the same field of faint dots the page opens on — move across it and the dots nearby light up — but with no stories in it yet: the empty field your story would be added to. With this change there is no stock photography left anywhere on the site; every picture you see was taken by a contributor.

### Features

* **home:** close the page on the night field, not a stock photo ([04d40f1](https://github.com/fr4d96/KakiNotes/commit/04d40f1bbe05c1882375bf76299dff3642f4e659))

## [0.5.0](https://github.com/fr4d96/KakiNotes/compare/v0.4.0...v0.5.0) (2026-09-16)

### What's new for everyone

**The home page opens on the stories, not a stock photo.** The photo slideshow at the top of the home page is gone. In its place is a dark field of faint dots that reacts to you: move your mouse or finger across it and the dots nearby bend toward you and light up. Every published story sits in that field as a brighter point — hover over one, tap it, or reach it with the Tab key to see the story's title and its record (place, kind of work, year), then click to read it. Nothing moves on its own, so there is no pause button any more and nothing plays while you read.

**Places in your language.** The short list of regions at the bottom of the hero now shows Chinese names when the site is set to Chinese. It was always English before.


### Features

* **home:** replace the hero photo slideshow with the night field ([35a9b61](https://github.com/fr4d96/KakiNotes/commit/35a9b61f2a721fb05441a6b2a416a559ca71dfc7))

## [0.4.0](https://github.com/fr4d96/KakiNotes/compare/v0.3.0...v0.4.0) (2026-09-16)

### What's new for everyone

**A bluer, deeper dark mode.** The dark theme's background has shifted from a near-neutral black to a deep navy — the same slate tone used by sites like sindresorhus.com. Cards, panels, search wells and the thin lines around them all follow, so the whole page reads as one cool, night-sky ground instead of a grey-black one. The cyan accent, the text colours and light mode are exactly as they were, and nothing has moved — only the colour underneath changed.


### Features

* **theme:** move the dark ground onto Tailwind's slate hue ([3031d18](https://github.com/fr4d96/KakiNotes/commit/3031d180d7f364f8b3b95cc533f9c18cd37d85b5))

## [0.3.0](https://github.com/fr4d96/KakiNotes/compare/v0.2.2...v0.3.0) (2026-09-16)

### What's new for contributors

**A first question instead of a blank page.** When you start a new story, the Story step now shows a small "Not sure where to start?" card above the editor with one question at a time — things like *"Who did you share a kitchen with, and what did they cook?"* Press **Write about this** and a matching section heading is added to your story with the cursor ready under it. **Show me another** cycles through 32 questions; **Hide** puts the card away for that story. Once you've written about 50 words the card leaves on its own.

**Start from an outline.** On the same card (or by typing `/outline` in the editor) you can drop in nine ready-made section headings — *Why New Zealand, Before I left, The first weeks, Finding work, Where I lived, What it cost, The best of it, The hard parts, What I'd tell myself* — and rename or delete any of them. It only works on an empty story, so it can never overwrite what you've written.

Every question is phrased around what happened to *you*, never as advice, so what you write stays on the right side of the "personal experience, not advice" rule. The questions are available in English and Chinese.

### What's new for everyone

**A tidier header.** When you're signed in, the light/dark switch and the English/中文 switch have moved out of the header and into the menu under your profile icon, just above *Sign out*. Signed-out visitors still see the two buttons in the header.

### Housekeeping

* The moderation guidelines no longer refer to the product by its old name.


### Features

* **editor:** story starters — a first question to answer instead of a blank page ([dbcecbb](https://github.com/fr4d96/KakiNotes/commit/dbcecbb904e8392b8236a7925e2f901ddbe75118))
* **nav:** move the theme and language switches into the profile menu ([e8aee48](https://github.com/fr4d96/KakiNotes/commit/e8aee48ce4b7a9437cbf47326b0836125c284026))

## [0.2.2](https://github.com/fr4d96/KakiNotes/compare/v0.2.1...v0.2.2) (2026-09-15)


### Performance Improvements

* **preview:** mint image preview URLs in one batched round trip ([175b1aa](https://github.com/fr4d96/KakiNotes/commit/175b1aa00281cb6f3fb0a73f37ed05d7002bbbe5))

## [0.2.1](https://github.com/fr4d96/NStoriesZ/compare/v0.2.0...v0.2.1) (2026-09-15)


### Bug Fixes

* **qa:** move the QA index from /index to /qa-index ([aacd591](https://github.com/fr4d96/NStoriesZ/commit/aacd591d2071ac2efbd2c9804f3e984346d627e2))

## [0.2.0](https://github.com/fr4d96/NStoriesZ/compare/v0.1.0...v0.2.0) (2026-09-15)


### Features

* a /notifications page behind the bell ([1b84606](https://github.com/fr4d96/NStoriesZ/commit/1b846065692e2e868c4f2e495c2c5904a4d524c8))
* **admin:** show the rate limits on the admin overview ([f73cc02](https://github.com/fr4d96/NStoriesZ/commit/f73cc0216a9d5f6f9a5c77cbc3c50f724a1dc694))
* **auth:** rate limit password reset ([7390b32](https://github.com/fr4d96/NStoriesZ/commit/7390b32496849d08072ddeaa7d301a52e7827205))
* **auth:** rate limit sign-in ([4ff87f1](https://github.com/fr4d96/NStoriesZ/commit/4ff87f10f413586fa691389a04679d0baf7ce346))
* **auth:** rate limit signup ([5bf5533](https://github.com/fr4d96/NStoriesZ/commit/5bf55336f2b4e33556bbc8b78f0bb3078b8d44d9))
* **auth:** sign in with a username, and /account becomes tabs ([4ecbe7b](https://github.com/fr4d96/NStoriesZ/commit/4ecbe7b71dcc3635b805ef6af040dd4f04d1eee6))
* compress story images the way WhatsApp does ([689a475](https://github.com/fr4d96/NStoriesZ/commit/689a475ca8f15d24dda203a0606aa5de6ba63b32))
* **contributor:** the public identity moves onto contributors ([d948864](https://github.com/fr4d96/NStoriesZ/commit/d94886471df899f62f360c271831e16b4e0d7208))
* **db:** record what a trip cost, category by category ([ff67386](https://github.com/fr4d96/NStoriesZ/commit/ff67386568ef04c05995ec7bb7f61de9e3f87875))
* give admins real tooling and a way to reach it ([3d19c8c](https://github.com/fr4d96/NStoriesZ/commit/3d19c8c115161fc465d027829e0426256f0db6f6))
* **i18n:** CJK font fallback, and the last of the contributor action errors ([4d81b53](https://github.com/fr4d96/NStoriesZ/commit/4d81b538b2045f6d8e5b8f83eed7a6c76bf20cc9))
* **i18n:** next-intl plumbing, locale cookie, and the language toggle ([d4cf2a5](https://github.com/fr4d96/NStoriesZ/commit/d4cf2a5201b11e9de6fd9473d7df265f3016feaa))
* **i18n:** region, destination and category names speak Chinese ([fd9d9aa](https://github.com/fr4d96/NStoriesZ/commit/fd9d9aab26022aab8cb0518fe06dfbf18494cc15))
* **i18n:** translate every public reader-facing screen ([c2ebbdd](https://github.com/fr4d96/NStoriesZ/commit/c2ebbddeb947368b4a0f44bbdfeefb973863f4f9))
* **i18n:** translate notifications, the new-story flows, and the PDF export ([818b8f8](https://github.com/fr4d96/NStoriesZ/commit/818b8f8175b7c5b1bdc55223f45c740ca2b248c5))
* **i18n:** translate the account area and My Stories ([5b2d8ad](https://github.com/fr4d96/NStoriesZ/commit/5b2d8ad2af9656476c3fa57ad1dea87baac81ded))
* **i18n:** translate the shared chrome, auth screens, and their validation ([632c0f8](https://github.com/fr4d96/NStoriesZ/commit/632c0f82906eb2d8fbd5919903efcd0e05a6a66b))
* **i18n:** translate the story editor and preview ([14eea6f](https://github.com/fr4d96/NStoriesZ/commit/14eea6f2a06056e5ff46a0fd0a0c08cfd55ddb81))
* in-app notifications for story review and publication ([a075e19](https://github.com/fr4d96/NStoriesZ/commit/a075e19df54992d1069e34a6cb3c8032585a0f2f))
* make the story editor and landing page worth using ([8ac5ec4](https://github.com/fr4d96/NStoriesZ/commit/8ac5ec4e5ed8c36f1ee22b2d47595c100d1fc9eb))
* **moderation:** say what each image is actually described by ([1918ad3](https://github.com/fr4d96/NStoriesZ/commit/1918ad324b7b2c9534a658185672e52841af5197))
* **my-stories:** edit a published story, and page the list at twelve ([c116b5b](https://github.com/fr4d96/NStoriesZ/commit/c116b5b46abf75ab9f33cc4bd0fa347fab41eef7))
* notify contributors on reject / changes requested, with the reason ([9125336](https://github.com/fr4d96/NStoriesZ/commit/91253363d0f4e6af43595d727b2a70c867d9b361))
* page "The record" five entries at a time ([e2399f4](https://github.com/fr4d96/NStoriesZ/commit/e2399f49f3ab31d8131f1fa9b2406c556e6d5e6b))
* **pdf:** rate limit the PDF import routes ([22d077b](https://github.com/fr4d96/NStoriesZ/commit/22d077b5ac3c23927e05a6cae95a496aba01e263))
* **public:** an aggregate page for what a working holiday actually cost ([4b4913d](https://github.com/fr4d96/NStoriesZ/commit/4b4913d088bac7ac044dcf4e1ab5658c316f61a6))
* **public:** show readers what a trip actually cost ([a1e4253](https://github.com/fr4d96/NStoriesZ/commit/a1e425326e7d18fd958d794ab4bbdcc0c698184f))
* rebuild moderation review around who, when, and what is wrong ([f369569](https://github.com/fr4d96/NStoriesZ/commit/f369569f8dd4aa5f25fe8f84b2c1110a08d31ddb))
* **story:** a contributor can ask for their story to be taken down ([77c0329](https://github.com/fr4d96/NStoriesZ/commit/77c03297a7f3611eaef3d3c5f70450d371fb2421))
* **story:** an Expenses step, with a donut of where the money went ([bef334b](https://github.com/fr4d96/NStoriesZ/commit/bef334ba484e7e66ca1aecebbdf9ad6422505375))
* **story:** contributors can download their own story as a PDF ([082cde5](https://github.com/fr4d96/NStoriesZ/commit/082cde50916d7b1f1f0ae8324e98fd7210673b2f))
* **story:** contributors can name a place we never seeded ([d78f59d](https://github.com/fr4d96/NStoriesZ/commit/d78f59d4f95205ea823034bd5566d7f5d6000697))
* **story:** list_published_stories and get_published_story return the contributor avatar ([468a9bb](https://github.com/fr4d96/NStoriesZ/commit/468a9bbae1b33c0414c4f46a1d4f8f970c9961a9))
* **story:** name your own expense category, and a breakdown holds five ([c364053](https://github.com/fr4d96/NStoriesZ/commit/c36405377a396dd51132902c9149196f69ab67bc))
* **story:** put the brand letterhead on the exported PDF ([4cf103f](https://github.com/fr4d96/NStoriesZ/commit/4cf103fb81c235a58d20131cdf8e60dcac2c8c9b))
* **story:** stories can be kept private, skipping moderation entirely ([b4cb666](https://github.com/fr4d96/NStoriesZ/commit/b4cb6661af9c43f75dad9e40c1da198982bb8097))
* **story:** story cards and the story page show the contributor's avatar ([11f5a7e](https://github.com/fr4d96/NStoriesZ/commit/11f5a7eebdf803e14d0c2addd74ab424666cdea2))
* **story:** the PDF export renders Chinese and emoji ([2a3c596](https://github.com/fr4d96/NStoriesZ/commit/2a3c596ab2e14ed9588e36ca60b1f940007ff9f5))
* turn the moderation overview into a real dashboard ([7187ae9](https://github.com/fr4d96/NStoriesZ/commit/7187ae98cdb765b64cea7ac9a260a210bb511fa6))
* turn writing a story into a guided six-step flow ([3dc6854](https://github.com/fr4d96/NStoriesZ/commit/3dc6854cd6dafdc6a743c56af4dead434ed4bc09))


### Bug Fixes

* **admin:** make the rate-limits table readable on a phone ([a96692b](https://github.com/fr4d96/NStoriesZ/commit/a96692bdfd85ebed64b87e9a5a64c645382b7ee9))
* bypass Vercel's function body limit for image uploads ([87956b9](https://github.com/fr4d96/NStoriesZ/commit/87956b9fb1c0f21a109a36a5d54050cd3ed60a20))
* cancel the record's pending scroll frame on unmount ([7dcdef6](https://github.com/fr4d96/NStoriesZ/commit/7dcdef66592510f2c38f50bfbdd7a818325f25a2))
* close the findings from a full-codebase audit ([3b1e705](https://github.com/fr4d96/NStoriesZ/commit/3b1e705cae4118f8cd23492b40b8fb369fd75e20))
* **contributor:** avatar initial takes a code point, not a UTF-16 unit ([116fce9](https://github.com/fr4d96/NStoriesZ/commit/116fce910b2a39560cdc35a091eb5b4e6b631851))
* **db:** a draft with an expense breakdown could not be deleted ([dd3f0c7](https://github.com/fr4d96/NStoriesZ/commit/dd3f0c734a850ee636d8c048288898b22657025c))
* **db:** copy contributor-authored labels into the next draft revision ([1a611ec](https://github.com/fr4d96/NStoriesZ/commit/1a611ec492b2f3ce80b3057b7b38d61f7f29a7e4))
* **editor:** nothing could be saved on a story with no body text yet ([25fd65d](https://github.com/fr4d96/NStoriesZ/commit/25fd65d391cd66a3d8dae1f4bd9d713cc8e2d89c))
* give HEIC uploads a bigger raw-size ceiling than JPEG/PNG/WebP ([a094d70](https://github.com/fr4d96/NStoriesZ/commit/a094d702904c9567e5f5c9758390162c56719e65))
* give light mode its own elevation strategy ([703971c](https://github.com/fr4d96/NStoriesZ/commit/703971cbbe7099ed62305dfe7f5dd65cf87db9c4))
* **i18n:** stop the story and byline pages caching what they never cached ([b094b94](https://github.com/fr4d96/NStoriesZ/commit/b094b9494b0b638cc2731c95dc5c3df9fce48a8a))
* **i18n:** the editor's required marker, back link, and save-error banner ([2d86e15](https://github.com/fr4d96/NStoriesZ/commit/2d86e154710acd244e5ce2d509512c1b7fac47b8))
* let a failed story media actually be re-processed ([a44144d](https://github.com/fr4d96/NStoriesZ/commit/a44144ddf2000edabd1613917f8fef4bf9c622e2))
* make HEIC iPhone/iPad uploads work on Vercel ([b29fc68](https://github.com/fr4d96/NStoriesZ/commit/b29fc68aee53cc89c509bea099e5d42597506106))
* **moderation:** the takedown queue had no horizontal padding at all ([85e576d](https://github.com/fr4d96/NStoriesZ/commit/85e576dadffd74bd73dffe1683d448d9aaa8e9e1))
* **public:** the story page's donut sits beside its legend, not above it ([189d7db](https://github.com/fr4d96/NStoriesZ/commit/189d7dbc02199cf07ff5f0f836d026a83fd4f92d))
* **report:** send a signed-out reporter back to the story by slug, not uuid ([16756f6](https://github.com/fr4d96/NStoriesZ/commit/16756f60b738e10b903c448541203b07dc66f170))
* ship libvips so sharp-using routes stop 500ing on Vercel ([a3e9b2c](https://github.com/fr4d96/NStoriesZ/commit/a3e9b2c6cbbee1ea1e487415bb25e2d30ee88e01))
* **staff:** one staff header, so the nav stops wrapping into the title ([e263ca9](https://github.com/fr4d96/NStoriesZ/commit/e263ca9021ed2baa79150be8133f389c8ab55fe2))
* **staff:** put the brand logo beside the wordmark on staff dashboards ([44f72da](https://github.com/fr4d96/NStoriesZ/commit/44f72daf64ed87d9678b8a012b469ad49ac937da))
* stop cover-thumbnail flicker and duplicate/incomplete location entries ([2f94824](https://github.com/fr4d96/NStoriesZ/commit/2f948248b6cbd8f8236e1b0426bfbfaababa3827))
* stop story images being stored corrupted on Vercel ([ed7c190](https://github.com/fr4d96/NStoriesZ/commit/ed7c190726974a056bb53639fe22bc3e40598176))
* stop the landing page scrolling sideways at 375px ([a647f82](https://github.com/fr4d96/NStoriesZ/commit/a647f82d9ab7a7a01a837f6d346963688cb194d9))
* **story:** anonymous attribution is actually anonymous ([2b92bdf](https://github.com/fr4d96/NStoriesZ/commit/2b92bdf250db85ce528dce4d13bb4e95bd6f54bd))
* **story:** stop the PDF export dragging the whole project into its bundle ([1aee56d](https://github.com/fr4d96/NStoriesZ/commit/1aee56d66721b2394e6c0534d9ca3cc3d4013894))
* **story:** the editor's donut centres in its column instead of floating high ([06faa20](https://github.com/fr4d96/NStoriesZ/commit/06faa20bb6d406ba660e64383904e86232e3a662))
* **story:** the expense donut caused a hydration mismatch on every render ([aba47bd](https://github.com/fr4d96/NStoriesZ/commit/aba47bd474d2e0c471dca351c803ea5b7452445f))
* **story:** the step rail shows every label again, in room it actually has ([6724b97](https://github.com/fr4d96/NStoriesZ/commit/6724b97664b3095531c5c9079bbbbf4c69db4293))
* **story:** the step rail was printing outside its own container ([1913215](https://github.com/fr4d96/NStoriesZ/commit/1913215a8ad5e3311d4edc07db3502f0b88c38f1))
* surface real upload errors, cut HEIC peak memory ([1e01da8](https://github.com/fr4d96/NStoriesZ/commit/1e01da8d86716c86b5df4b0e48da612d7c7e9120))
* **tags:** open the tag list from its own button, not while you type ([0fce216](https://github.com/fr4d96/NStoriesZ/commit/0fce21625ea812e979154f301fb616c35012d129))
* **test:** explain, clean up, and guard the orphaned cleanup rows ([511e89e](https://github.com/fr4d96/NStoriesZ/commit/511e89e2056f3d4b1315c97fe367900011f4d10b))
* **test:** the RLS cleanup script was missing two child tables ([fa7eb2b](https://github.com/fr4d96/NStoriesZ/commit/fa7eb2b2cfd0c339a4395e4efb90ae8bb5b785f7))


### Performance Improvements

* **home:** stop scroll jank — blur budget, fill mode, and the hero's four layers ([695093a](https://github.com/fr4d96/NStoriesZ/commit/695093a9aae59bc771e7ec2327395c63574da48c))
* **my-stories:** one RPC per page, not one preview call per story ([3326b5d](https://github.com/fr4d96/NStoriesZ/commit/3326b5d1bc9793fc9f35a77e2f33c91ffc17ac7c))
* **public:** cache public page data now the language cookie makes routes dynamic ([c6d6e1c](https://github.com/fr4d96/NStoriesZ/commit/c6d6e1ca4a70518d909eb33a57a7d89b0875bd43))
