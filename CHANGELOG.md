# Changelog

## [2.1.3](https://github.com/fr4d96/KakiNotes/compare/v2.1.2...v2.1.3) (2026-10-31)

### Affirmation notes

**A warmer prompt in the note box.** When someone opens your link, the empty note box now says "Leave a memorable message" instead of "What would you like them to know?". The Chinese version says the same thing.



### Bug Fixes

* note box placeholder reads "Leave a memorable message" ([a91a314](https://github.com/fr4d96/KakiNotes/commit/a91a314ecd2381d61f8a2573edc6cd17fe9d3315))

## [2.1.2](https://github.com/fr4d96/KakiNotes/compare/v2.1.1...v2.1.2) (2026-10-31)

### Affirmation notes

**A simpler page for the people writing to you.** When someone opens your link, they now see only your link's name, a box for their note and an optional box for their name. Nothing else is on the page.

**No menus or site links.** The Kakinotes header, footer and bottom tabs are gone from this page, so friends can't wander off before they send their note.

**Less text.** The "Leave a note for…" heading and the extra explanations are gone. The name you gave the link (like "Thrillzone Buddies") is now the page's title.

**Your links still work.** The address of each link hasn't changed, so anything you've already shared opens the new page.



### Bug Fixes

* note-writing page shows only the link name and the form ([b538442](https://github.com/fr4d96/KakiNotes/commit/b5384429421303b223506b9bf004c2be7ddbdb10))

## [2.1.1](https://github.com/fr4d96/KakiNotes/compare/v2.1.0...v2.1.1) (2026-10-31)

### Affirmation notes

**Shared links now open.** In 2.1.0, a link copied from the Affirmation notes page sent people to an old copy of the site, which said the page didn't exist. Copied links now open on the site you're using, so friends land straight on the page where they write their note.

**Links you already made still work.** Nothing about your existing links has changed. Copy them again from Affirmation notes to get the working address, and send that instead.



### Bug Fixes

* affirmation share links open on the current site ([59aee6f](https://github.com/fr4d96/KakiNotes/commit/59aee6f56ebea11cbf9d9a600346cdafd1b3c2dd))

## [2.1.0](https://github.com/fr4d96/KakiNotes/compare/v2.0.0...v2.1.0) (2026-10-31)

### Affirmation notes

**Collect kind words from the people who know you.** Contributors have a new page, Affirmation notes, in the account menu. Make a link, send it to friends, family or people you travelled with, and they can leave you a short note.

**No account needed to write.** Anyone with your link can open it, write up to 1,000 characters, add their name if they want to, and send it.

**Only you can read them.** Notes land in "Notes for you" on the same page. They are never shown on the site, never listed in search engines and never seen by other readers. You can delete any note.

**You stay in control of your links.** Give each link a name (like "Family chat"), copy or share it from your phone, switch it off when you're done collecting, or delete it. You can have up to 20 links.

**Protected against spam.** Each link and each person can only send a limited number of notes per hour, so one link can't be used to flood your inbox.



### Features

* affirmation notes — share a link, collect private notes ([55c04fa](https://github.com/fr4d96/KakiNotes/commit/55c04fa0138ac29da491aff5f84f5b31f34dfe52))

## [2.0.0](https://github.com/fr4d96/KakiNotes/compare/v1.17.0...v2.0.0) (2026-10-31)

### A new home page

**Shorter, and easier to find your way.** The home page has been rebuilt for phones. It is now less than half as long, with far less to read, and real stories show up on the very first screen.

**Search straight away.** There's a search box at the top. Type a place, a job or a year, and you go straight to the stories that match.

**Swipe through the latest stories.** The newest stories sit in a row you can swipe sideways. Tap anywhere on a card to read it, or tap "See all" for the full list.

**Browse by place.** Photo tiles show the regions people have written about. Tap one to see every story from that region.

**Less to read.** The reasons you can trust what you read are now three short lines. The "Not sure where to start?" quiz is folded into one row; tap it to answer the five questions.

**Removed from the home page.** The draggable stack of featured stories and the long numbered list with filters and pages are gone. The Stories tab still has every story, with search and filters.

### A smaller footer on phones

At the bottom of the home page, phones now show only the note that Kakinotes isn't advice, one row of links (About, Privacy, Terms, Guidelines, Copyright & Removal) and the copyright line. On a computer, the footer is unchanged.



### Features

* **home:** shorter app-style home page and slim phone footer ([759de6c](https://github.com/fr4d96/KakiNotes/commit/759de6c77d60133716bc6ef96cf02702aca2ec2e))


### Miscellaneous Chores

* release 2.0.0 ([8c5da78](https://github.com/fr4d96/KakiNotes/commit/8c5da7813d12a59421741710028a9fab08411564))

## [1.17.0](https://github.com/fr4d96/KakiNotes/compare/v1.16.0...v1.17.0) (2026-10-30)

### Finding stories

**Search as you type.** On the Stories page, results now update while you type. There's no need to press Enter or tap Apply, and any filters you've chosen stay on. While new results load, the search icon turns into a small spinner.

**Search by keywords.** You no longer need a story's exact words. Type a few keywords in any order, and you'll get every story that mentions all of them, in its title, summary, story text, tags or places. Part of a word is enough: "kiw" finds "Kiwi", and "supermarket" also finds "Supermarkets". A search like "cheap food" now finds stories that talk about both, even when those words aren't in the title.

### Fixes

**Pull to refresh really refreshes.** In the home-screen app, pulling down at the top of a page now reloads it completely, so you always see the latest stories and changes. Before, it often looked like nothing happened. The launch screen doesn't flash up during the reload.

**Story photos on the home page.** On a phone, the list of stories on the home page now shows each story's cover photo beside its title. Stories without a photo show the Kakinotes sketch instead of an empty space.



### Features

* **search:** keyword search across story text, tags and places ([357e3b5](https://github.com/fr4d96/KakiNotes/commit/357e3b5099dcce37c82c3ac7cb5c9b148f394796))
* **stories:** search as you type ([0202c39](https://github.com/fr4d96/KakiNotes/commit/0202c39dc506937c4f2c3c88dc7615803b10ca2e))


### Bug Fixes

* **home:** show story covers in the record on phones ([1aed9eb](https://github.com/fr4d96/KakiNotes/commit/1aed9eb125395417abfda58087de8105beb01360))
* **mobile:** pull to refresh reloads the page ([cada3e6](https://github.com/fr4d96/KakiNotes/commit/cada3e66b53002858c2948a638131f7ac0c62687))

## [1.16.0](https://github.com/fr4d96/KakiNotes/compare/v1.15.0...v1.16.0) (2026-10-30)

### Kakinotes on your iPhone feels more like an app

These changes are for Kakinotes added to your home screen. Kakinotes in a Safari tab works as before.

**A proper launch screen.** Opening Kakinotes from your home screen no longer shows a blank screen while it starts. You see the Kakinotes icon in the middle of the screen, in light or dark to match your phone. If loading takes a moment, a thin loading bar appears under the icon, and the screen fades away as soon as the app is ready. If you added Kakinotes to your home screen before this update, remove it and add it again from Safari to get the launch screen.

**Pull down to refresh.** At the top of any page, pull down until the refresh circle fills, then let go to load the latest stories and changes. A gentle pull just springs back. Pulling on a map, a photo or while typing won't trigger it.

**No accidental zooming.** Pinching with two fingers or double-tapping no longer zooms the whole page, so the app stays put like other apps on your phone. The journey map still zooms with two fingers. If you need things bigger, your iPhone's own Zoom (Settings, then Accessibility, then Zoom) still works.

### Fixes

**Journey map buttons work on every journey.** On a journey with a single pin on the map, the zoom in, zoom out and re-centre buttons did nothing. They now work, both on your own journey pages and on a contributor's profile.



### Features

* **mobile:** launch splash, pull to refresh, no page pinch-zoom in the app ([876c933](https://github.com/fr4d96/KakiNotes/commit/876c93333c153433dcfce51bc1d63d8ceda06fad))


### Bug Fixes

* **journey:** zoom and re-centre work on a one-pin map ([bead368](https://github.com/fr4d96/KakiNotes/commit/bead368507a136addde3e8eb1ef0cdf5998d40b5))

## [1.15.0](https://github.com/fr4d96/KakiNotes/compare/v1.14.0...v1.15.0) (2026-10-30)

### Smoother on your phone

**Scrolling no longer lights up stories.** Scrolling through Stories or My Stories used to flash each story as your thumb passed over it, as if you had tapped it. Stories now only react when you actually tap them on a phone. On a computer they still highlight as your mouse moves over them.

**Scrolling doesn't get stuck on photos.** Swiping up or down over a story's photos now scrolls the page, instead of catching on the photos and stopping.

**Every button reacts when you tap it.** Buttons give a quick little bounce when tapped, so you know your tap registered, even on a fast tap. If you've asked your device to reduce motion, they fade slightly instead.

**More room at the top of pages.** Pages whose name is shown in the top bar no longer leave an empty gap above their content.

### Getting around

**A back arrow, like other apps.** The "Back to …" text links are gone. Pages you open from somewhere else now have a ← arrow at the top left, beside the page name. Stories have one too, whether you're reading, editing or previewing. It takes you back to wherever you came from: My Stories, the Stories list, a profile or a folder. If you opened the story from a link, it takes you to My Stories (or to Stories for a published story).

**Journey is now a tab.** When you're signed in, the bottom bar's third tab opens your journey map instead of Contributors. Contributors is now at the top of your account menu. Visitors who aren't signed in still see Contributors in the tab bar.

### What's new for contributors

**Story folders work by tapping.** Tap "New folder", pick the main story, then tick its sub stories and save. Dragging is gone, so it now works on a phone too. Each folder shows its main story first and then its sub stories, each with a link to open it. A folder you open again starts with its current sub stories ticked, so you can untick any you want to take out. Drafts no longer fill the page; they're summed up in one line.

**A clearer journey map.** The Journey map lists only your published stories, each main story with its sub stories underneath and a count of how many are pinned. Tap one to open that journey on its own page, with its map at the top and each story ready to pin. "Add place / Change place / Remove" now read "Pin on map / Move pin / Remove pin". Long story names no longer get cut down to a few letters.

**My Photos starts tidy.** Each story is one row showing its cover and how many photos it has. Tap a row to see that story's photos, and opening another story closes the first. Photos only load when you open their story.

**Less clutter on your story's preview.** On a published story, "Download a copy" is now a small download button next to "Edit this story", instead of taking up a row of its own.

**Import from PDF has a back arrow** to take you back to New Story.



### Features

* **journey:** list published journeys, a page per journey, clearer pin wording ([966ec76](https://github.com/fr4d96/KakiNotes/commit/966ec760ea3a54677e6f6993b4ba7572a9affdd2))
* **my-photos:** stories start collapsed, one open at a time ([d7f224d](https://github.com/fr4d96/KakiNotes/commit/d7f224d464498c876c4a2e76d91039f95edcaf98))
* **my-stories:** tap-first story folders and arrow back navigation ([ce8af67](https://github.com/fr4d96/KakiNotes/commit/ce8af67bd6705aaec59c043d6518a0f17fb7dad7))
* **nav:** back arrow on story pages and PDF import, Journey tab ([aec1389](https://github.com/fr4d96/KakiNotes/commit/aec1389c8a46cada7d680bf249eaa037afa9ee25))
* **ui:** spring-back pulse on every button tap ([5da2f8c](https://github.com/fr4d96/KakiNotes/commit/5da2f8c2ae50df777e0551572b4b6bf3c9ea6abf))


### Bug Fixes

* **mobile:** reclaim space at the top of pages and on story rows ([dcbd35a](https://github.com/fr4d96/KakiNotes/commit/dcbd35a614cc9f2ce7ed7111dd916d0e06337f31))
* **mobile:** stop scroll from highlighting stories and sticking on photos ([6681a1c](https://github.com/fr4d96/KakiNotes/commit/6681a1c1c196ecd63af2377b2e5a988c97f89c4e))

## [1.14.0](https://github.com/fr4d96/KakiNotes/compare/v1.13.0...v1.14.0) (2026-10-30)

### Photos in stories

**Swipe through a story's photos.** A story's photos now sit in one frame you swipe through, like a post on Instagram. A counter in the corner shows where you are ("2/5"), and dots underneath light up as you go. Photos an author placed back to back in the story text are grouped the same way. A single photo in the text stays exactly where and how big the author put it.

**Tap a photo to see it full screen.** The photo grows out of the page to fill the screen, and shrinks back into place when you close it. Swipe left or right to move between photos, and drag a photo down to close it. On a computer, use the arrow buttons or the arrow keys. If you've asked your device to reduce motion, photos open and close without the zoom.

**Photos load more gently.** Instead of a spinning wheel, each photo's space shows a soft shimmer until the photo has fully arrived, then the photo fades into place.

### What's new for contributors

**Covers fill your My Stories list.** In the list view, each story's cover photo now runs down the whole left side of its row instead of sitting as a small thumbnail in the corner.

### Easier to use

**The footer is only on the home page.** Other pages now end with their own content instead of a long block of links, and the tab bar and top bar handle getting around. Privacy, Terms, Guidelines and Copyright & Removal are linked from the home page footer.



### Features

* **layout:** show the site footer on the home page only ([803a777](https://github.com/fr4d96/KakiNotes/commit/803a77716fb63b302bc2e0471c6abd11aaa528bb))
* **stories:** covers fill My Stories rows; photos load with a sheen ([0550e17](https://github.com/fr4d96/KakiNotes/commit/0550e17b36324bc62ef394b833fe75beb12f561b))
* **stories:** Instagram-style photo carousel and a Photos-style viewer ([4a5d858](https://github.com/fr4d96/KakiNotes/commit/4a5d858aa0da43fce1c546f7d5958a49a5d80596))

## [1.13.0](https://github.com/fr4d96/KakiNotes/compare/v1.12.0...v1.13.0) (2026-10-30)

### Kakinotes on your iPhone

**Add Kakinotes to your home screen.** In Safari, tap Share, then "Add to Home Screen". Kakinotes gets its own icon and opens full screen like an app, without Safari's address bar. You'll need to sign in once inside the home-screen app, because iPhone keeps its sign-ins separate from Safari's.

**A tab bar at the bottom.** On a phone, Home, Stories, Contributors and My Stories (or Sign in) are always one tap away at the bottom of the screen. Tap the tab you're already on to jump back to the top. The bar tucks itself away while you're writing a story or typing, so it never sits on top of the keyboard.

**Pages move like an app.** Opening a story slides it in from the right, and going back slides it the other way. Switching tabs fades between them. If you've asked your phone to reduce motion, pages just fade quickly instead.

**The page you're on is named at the top.** On a phone, the top bar now shows where you are, such as "Stories" or "My Stories", next to the Kakinotes logo. Pages no longer repeat that as a big heading, which leaves more room for the stories themselves. Story pages and contributor profiles keep their big titles.

**Menus and filters slide up from the bottom.** On a phone, the menu, your account menu and the story filters open as panels from the bottom of the screen. Swipe one down, tap outside it or tap × to close it.

### What's new for contributors

**My Stories fits your phone.** Your stories now start on the first screen instead of below a stack of buttons. New Story is the green + button, and story folders, journey map, My Photos and Import are small icons in one row, with nothing to scroll sideways. Region, destination and tag filters are behind the filter button, which shows how many filters are on, and "Show N stories" closes them.

### Easier to use on a phone

**Bigger tap targets.** Buttons, links, step dots in the story editor, journey map pins and download buttons are now easier to hit with a thumb, mostly without looking any bigger. Buttons respond when you press them.

**Nothing hides under the notch.** The top bar, the editor's step bar and the bottom tab bar keep clear of the camera cut-out and the home bar on newer iPhones.

### Good to know

**No offline mode, on purpose.** The home-screen app always loads fresh from Kakinotes. It never saves pages or photos on your phone, so a story that has been taken down or isn't public yet can't reappear from a stored copy.



### Features

* **mobile:** installable iPhone web app with native-feel navigation ([d0096f3](https://github.com/fr4d96/KakiNotes/commit/d0096f393f4f0d4695b5b4fb36a709c288e92d14))
* **mobile:** page titles in the phone header and a compact My Stories ([cf1f784](https://github.com/fr4d96/KakiNotes/commit/cf1f78424e9af18873769060f48dd587251dc8d4))

## [1.12.0](https://github.com/fr4d96/KakiNotes/compare/v1.11.0...v1.12.0) (2026-10-29)

### What's new for readers

**Journey maps now belong to the writer, not one story.** A contributor's profile has a new Journey tab showing their whole trip around New Zealand. Each pin is a place they wrote about. The campervan drives from place to place in trip order, and tapping a pin shows the place, the story's title and a "Read this story" link. The tab only appears once a contributor has pinned at least one story.

**Places inside a place.** Some pins have a "+2 places" badge: those are the writer's shorter stories filed under a main story. Tap the pin and the map zooms in to show them, each with its own link. Tap "Back to whole journey" to zoom out.

**From a story to the map.** A story that's on its writer's journey now has a "See this on …'s journey" link. The small map at the bottom of individual stories is gone.

### What's new for contributors

**A Journey map page in My Stories.** Find it next to Story folders. For each of your published New Zealand stories, choose a place: tap the map, use "Choose the middle of the map", or paste a Google Maps link, then give the place a name. Stories you've filed under a main story in Story folders appear inside that story's pin automatically. Changes show on your profile straight away, and you can remove a pin at any time.

**The journey section has left the story editor.** You no longer add stops while editing a story; the Journey map page replaces it.

### Privacy

**Your original photo files are no longer kept.** When you upload a photo, Kakinotes makes a cleaned-up copy with location and camera details removed, and that copy is the only one anyone ever sees. The original file is now deleted as soon as the cleaned-up copy is ready. If a photo fails to process, its original is kept for 30 days so it can be repaired, then deleted.

### Good to know

**Pins are approximate.** A pin's position is rounded to about 1 km and must be inside New Zealand. Readers only see the place name you give it. The journey map is for New Zealand stories only.



### Features

* **journey:** contributor journey map, one pin per story ([1a6bdc3](https://github.com/fr4d96/KakiNotes/commit/1a6bdc37c9d36a159b141d53f7ccf78e5081a7bd))
* **media:** delete raw story-image originals after processing ([b341342](https://github.com/fr4d96/KakiNotes/commit/b341342448f148024036450e2db6b1e12c13a5e5))
* **media:** delete raw story-image originals after processing ([d544d8e](https://github.com/fr4d96/KakiNotes/commit/d544d8efea0afea353185a62da3506e21f94a391))

## [1.11.0](https://github.com/fr4d96/KakiNotes/compare/v1.10.0...v1.11.0) (2026-10-29)

### What's new for readers

**A China section.** Kakinotes now has first-person travel stories from China, alongside the New Zealand Working Holiday stories. Use the NZ | China switch on the home page, or go straight to /cn. The China section has its own stories, contributors, costs and about pages, in English and Chinese.

**New Zealand is unchanged.** All New Zealand pages and links work exactly as before. The China section is general travel stories, not Working Holiday Visa stories.

### What's new for contributors

**Choose your story's country.** The Places step in the story editor now starts with a Country choice. The regions, towns and place search all follow the country you pick. You can change the country until the story is first published; after that it stays fixed.

**Type in any place.** "Add a location manually" now lets you type a region or area (and, if you like, a town or place) instead of picking from a list, so you can add places that aren't listed.

**PDF imports know the country too.** Starting a story from a PDF, from either the New Zealand or the China section, records the right country.

### Good to know

**The journey map is New Zealand only.** It draws a map of New Zealand, so it's offered on New Zealand stories and doesn't appear on China stories.




### Features

* **china:** China travel-stories section under /cn ([d6d7b53](https://github.com/fr4d96/KakiNotes/commit/d6d7b53200fb6f05978f92e0dbfba86804179db2))

## [1.10.0](https://github.com/fr4d96/KakiNotes/compare/v1.9.0...v1.10.0) (2026-10-29)

### What's new for readers

**A journey map on stories.** Stories can now show an illustrated map of New Zealand with the route the writer travelled. A little campervan drives from stop to stop (and takes the ferry across Cook Strait), and a timeline beside the map follows along. Press Pause or Play at any time, or tap a stop to jump straight to it.

**Places inside a stop.** Some stops have a "+3 places" badge. Tap one and the map zooms in to show the smaller places the writer visited there, like Arrowtown and Glenorchy inside Queenstown. Tap "Back to whole journey" (or press Esc) to zoom out again.

**Zoom and look around.** Use the + and − buttons, pinch on a phone, or hold Ctrl/⌘ while scrolling to zoom. Drag to look around, and use the re-centre button to follow the van again. The map also works in dark mode.

**Jump to that part of the story.** If the writer linked a stop to a section of their story, "Read this part" takes you straight there.

### What's new for contributors

**Add your journey in the story editor.** Tap the map to drop a pin, or paste a Google Maps link and the pin is placed for you. Give each stop a name and, if you like, link it to one of your story's headings. You can have up to 12 main stops, with up to 8 places inside each one.

**Group places under a main stop.** Use "Part of" on a stop, or tap a main stop's pin and choose "Add places inside", to keep busy areas tidy. Readers only see those places when they open the main stop.

**Easy to fix mistakes.** Tap a pin to remove or rename it, and Undo brings back anything you removed by accident.

### Good to know

**Your exact location is never shown.** Pins are rounded to about 1 km, must be inside New Zealand, and readers only ever see the place names you type, never coordinates.

**Reviewed with your story.** The journey map is part of your story, so changes to it go live once that version of your story is approved, like any other edit.




### Features

* **stories:** journey map with main stops and places inside ([1d3679f](https://github.com/fr4d96/KakiNotes/commit/1d3679fe7f6dc7db30e476291574aacee880805f))

## [1.9.0](https://github.com/fr4d96/KakiNotes/compare/v1.8.0...v1.9.0) (2026-10-21)


### What's new for contributors

**Story folders.** You can now group your published stories into folders. A main story works like a folder, and you can file other stories under it as its sub stories. Go to My Stories and choose "Open story folders" to organise them.

**Drag a story into a folder.** Drag a story onto a main story to file it there. On a phone, press and hold the story first, then drag. Every story also has a "Move to" menu that does the same thing without dragging, and you can take a story out of its folder at any time.

**Readers see them together.** A main story's page now lists its sub stories under "More in this story", and each sub story shows "Part of" with a link back to its main story.

### Good to know

**One level, published stories only.** A sub story can't have its own sub stories, and only published stories can go into a folder. Drafts and private stories show up greyed out until you publish them. Changes show on your public pages straight away, with no review.

**Your existing links carried over.** Stories you had linked before have become a folder under the story they were linked to most.

**Story pages are working again.** Since 13 October, some public story pages showed "Something went wrong" instead of the story. That's fixed in this release.



### Features

* **stories:** story folders page for main and sub stories ([538ab5b](https://github.com/fr4d96/KakiNotes/commit/538ab5b88e11b4858c3d391237c7b57aa4b262e2))

## [1.8.0](https://github.com/fr4d96/KakiNotes/compare/v1.7.0...v1.8.0) (2026-10-12)

### What's new for contributors

**Keep your photos in full quality.** If you've connected Google Drive, every new photo you upload is now saved twice in your Drive: the version readers see on Kakinotes, and a full-size copy at the photo's original resolution. The full-size copies go in a "Full quality" folder inside each story's folder, numbered to match the others.

**Download them from My Photos.** Photos with a full-size copy are marked "Full quality", and their Download button gives you the full-size version.

**Private to you.** Only you can download a full-size copy. Readers, editors and moderators only ever see the regular version. Location and camera details are removed from both copies.

### Good to know

**Only for Google Drive, and only for new photos.** Photos stored on Kakinotes keep the regular size; connect Google Drive in Account settings to start keeping full-size copies. Photos uploaded before this release don't have a full-size copy, because the original files weren't kept.



### Features

* **drive:** keep a full-quality copy of each new Drive photo ([7900c08](https://github.com/fr4d96/KakiNotes/commit/7900c08d960cc331fef2fe27507a561a6d48774f))

## [1.7.0](https://github.com/fr4d96/KakiNotes/compare/v1.6.0...v1.7.0) (2026-10-11)

### What's new for contributors

**All your photos in one place.** A new My Photos page shows every photo on your stories, grouped by story, whatever state each story is in: drafts, stories waiting for review, published and private ones. Find it in the menu under your profile picture, or with the My Photos button on My Stories.

**Download any photo.** Each photo has its own Download button that saves it to your device. You always get the same cleaned copy readers see, with location and camera details removed.

**See where each photo is kept.** Every photo says whether it's stored on Kakinotes or in your Google Drive. If you've disconnected Google Drive, photos kept there show a "Reconnect Google Drive" link instead.

### Good to know

**One photo at a time for now.** There's no "download everything as one file" option yet.



### Features

* **photos:** My Photos page with a download per photo ([a2f75ba](https://github.com/fr4d96/KakiNotes/commit/a2f75ba8bfe0dbd91c9bc75f65274164efdfe1fd))

## [1.6.0](https://github.com/fr4d96/KakiNotes/compare/v1.5.0...v1.6.0) (2026-10-09)

### What's new for contributors

**A tidier photo grid.** In the Photos step of the story editor, each photo's Details button now sits on the photo itself instead of underneath it, so the grid is more compact and you see more of your photos at once.

**Details when you need it.** On a computer, move your mouse over a photo and its Details button appears. On a phone or tablet it's always shown, since there's no mouse to hover with. If you move around with the keyboard, it shows as soon as you reach it.

**See at a glance which photos you can enlarge.** A small magnifier icon in the top-right corner of each photo is a reminder that you can tap or click any photo to see it large.



### Features

* **editor:** Details on the photo on hover, zoom icon always shown ([8352324](https://github.com/fr4d96/KakiNotes/commit/835232415f556cdb759c7df9115acab017c350ae))

## [1.5.0](https://github.com/fr4d96/KakiNotes/compare/v1.4.1...v1.5.0) (2026-10-08)

### What's new for contributors

**Drag your photos into the order you want.** In the Photos step of the story editor, pick up a photo and drop it where it should go. The other photos make room as you move it, and the new order saves on its own.

**Works on your phone too.** Press and hold a photo for a moment, then drag it. A quick swipe still scrolls the page as normal, so you won't move a photo by accident.

**Tapping still opens the photo.** A plain click or tap shows the photo large, just as before. The "Move earlier" and "Move later" buttons under Details are still there if you'd rather use those, or use a keyboard.



### Features

* **editor:** drag photos to reorder them ([3f0c4ed](https://github.com/fr4d96/KakiNotes/commit/3f0c4ed042e0ff14a31e614d05073ea1232711e2))

## [1.4.1](https://github.com/fr4d96/KakiNotes/compare/v1.4.0...v1.4.1) (2026-10-08)

### Fixed

**Choose which Google account to connect.** When you press "Connect Google Drive", Google now always asks which account to use, and lets you add another one. Before, if your browser was signed in to a single Google account, Kakinotes connected that one without asking.

### Good to know

**Switching to a different Google account.** Disconnect first from Account → Google Drive, then connect again and pick the other account. Photos already stored in the first account's Drive stop showing on your stories after you switch, because Kakinotes doesn't keep a copy of them.



### Bug Fixes

* **drive:** always show Google's account chooser when connecting ([862e9fb](https://github.com/fr4d96/KakiNotes/commit/862e9fbe73f06affc40f9ef34130a9f6c6600bb4))

## [1.4.0](https://github.com/fr4d96/KakiNotes/compare/v1.3.0...v1.4.0) (2026-10-08)

### What's new for contributors

**Move your older photos into your Google Drive.** If you connected Google Drive, the Google Drive tab in Account settings now shows a "Move photos to Drive" button for any photos you uploaded before you connected. Press it and Kakinotes moves them into your Drive one by one, into the same tidy per-story folders as your new photos. A progress bar shows how far along it is.

**Your stories keep working while it moves.** Readers never see a broken or missing photo on a published story, before, during or after the move. Once a photo is safely in your Drive, and Kakinotes has checked the copy matches exactly, Kakinotes deletes its own copy, including the original you first uploaded.

**Stop and pick up later.** You can stop after the current photo, or just close the page. Nothing is half-moved: every photo is either still on Kakinotes or fully in your Drive. Press the button again to carry on. If a photo can't be moved, for example because its story is being published at that moment, you'll see which story it belongs to and why, and it stays safely on Kakinotes.

### Fixed

**Photos stored in Google Drive now show to readers.** On published stories, photos kept in a contributor's Google Drive could appear as a broken image to anyone who wasn't signed in. They now show for everyone. This fix was already live before this release.

### Good to know

**Moving is your choice, and it's one-way for now.** Nothing moves unless you press the button. Once a photo is in your Drive, Kakinotes no longer keeps a copy, so keep it in your Drive to keep it showing. Photos in stories an editor imported for you stay on Kakinotes.

**Published photos are tidied up a little later.** Kakinotes keeps its old copy of a published photo for 5 minutes after the move, so no reader ever catches a gap. It's deleted the next time you press the button.



### Features

* **drive:** move existing photos to Google Drive ([9ea199d](https://github.com/fr4d96/KakiNotes/commit/9ea199dbbcf2cc2bd307013d7c6acefbcad7865f))


### Bug Fixes

* **drive:** serve published Drive photos to readers ([9b19540](https://github.com/fr4d96/KakiNotes/commit/9b19540d81e22475d313b12ac99d9f5e34ad2daf))

## [1.3.0](https://github.com/fr4d96/KakiNotes/compare/v1.2.0...v1.3.0) (2026-10-07)

### What's new for contributors

**Keep your story photos in your own Google Drive.** In Account settings there's a new Google Drive tab. Connect your Google account, and from then on any photo you add to one of your own stories is saved in your Google Drive instead of on Kakinotes. Kakinotes only asks for access to the files it creates itself. It can't see anything else in your Drive.

**Your photos are cleaned before they're saved.** Location and camera details are removed from every photo before it lands in your Drive. The original you uploaded is deleted straight after, not left in your Drive's bin.

**Tidy folders, one per story.** Photos go into a "Kakinotes" folder in your Drive, with a folder for each story named after its title, and the photos numbered 01, 02, 03 in the same order as in your story. Rename the story and its folder follows. Reorder or remove photos and the numbers follow too.

**Nothing changes if you don't connect.** Connecting is optional. If you don't, your photos are stored exactly as before. Your published stories look the same either way, and readers never see a Google Drive link.

**You can disconnect at any time** from the same tab. Kakinotes also cancels its access on Google's side.

### Good to know

**Google Drive is in early testing.** For now only a small group of invited test accounts can connect. Everyone else will see a message from Google saying access is blocked. It will open up to everyone later.

**Photos in Drive belong to you.** If you delete or move a story's photo in your Drive, or disconnect, that photo can stop showing on your story. Kakinotes doesn't keep a backup copy.



### Features

* **drive:** connect and disconnect Google Drive from Account settings ([d5ffcb6](https://github.com/fr4d96/KakiNotes/commit/d5ffcb6418ec370976322c4958b59d39666c1add))
* **drive:** store a contributor's photos in their own Google Drive ([acabcb8](https://github.com/fr4d96/KakiNotes/commit/acabcb89c0a2dc7335456d4c6e4819764d9e896a))

## [1.2.0](https://github.com/fr4d96/KakiNotes/compare/v1.1.0...v1.2.0) (2026-10-03)

### What's new for everyone

**Stories can belong together.** A writer can now group their stories, for example "Fergburger" and "Rata" under a bigger story called "Food in Queenstown". At the end of the main story you'll see a "More in this story" section with a small card for each story in the group: its title and cover photo, and a tap takes you there. Each story in the group shows "Part of: Food in Queenstown" at the top, so you can always get back to the main one.

### What's new for contributors

**Link your stories from My Stories.** Each of your published stories now has a link button (the chain icon) in My Stories. Tap it, pick which of your other published stories it belongs under, and save. The link shows on both stories straight away. There's no extra review, because both stories have already been approved. You can change or remove a link the same way.

**A few simple rules.** You can only link your own stories, and only ones that are already published: drafts and stories waiting for review don't get the button. Grouping goes one level deep, so a story that's inside a group can't have its own group, and a main story can't be put inside another one. If you ever take a story down, its link just stops showing.


### Features

* **stories:** link published stories from My Stories, live straight away ([648060b](https://github.com/fr4d96/KakiNotes/commit/648060b67ecd051e0185ed8f0fbe114a4f94c8e9))
* **stories:** sub stories — database and server layer ([529a629](https://github.com/fr4d96/KakiNotes/commit/529a62911e31ec4d3e73fc433bb767ec34bccdd6))
* **stories:** sub stories UI — picker, "Part of" link and sub story list ([f7d0e33](https://github.com/fr4d96/KakiNotes/commit/f7d0e33d97316313f88774cd0cc2822523618dc7))

## [1.1.0](https://github.com/fr4d96/KakiNotes/compare/v1.0.1...v1.1.0) (2026-09-29)

### What's new for contributors

**The story editor is just for words now.** You can no longer drop a photo into the middle of your text. The photo button in the toolbar, the "/photo" shortcut and the "Add to story" button on each photo are gone. You still add photos in the Photos step, and they show in a gallery with your story. Stories that already have photos inside their text still show them.

**One simple caption per photo.** Each photo used to ask for a description, a caption and whether it was "decorative". Now there's one box: a caption, and it's optional. If you write one, it shows under the photo and people using screen readers hear it too. If you leave it empty, that's fine. Nothing nags you about photos without a caption any more.


### Features

* **stories:** words-only story editor and one optional caption per photo ([bd45952](https://github.com/fr4d96/KakiNotes/commit/bd459528488ea4951743dadc918e9ee24c82b58a))

## [1.0.1](https://github.com/fr4d96/KakiNotes/compare/v1.0.0...v1.0.1) (2026-09-26)

### What's new for contributors

**Adding more than one photo works again.** After your first photo uploaded, the second one failed, and so did everything after it: your writing stopped saving, and so did tags and places, until you reloaded the page. Now you can add several photos in a row, even all at once, and keep writing straight after. If your story really was changed somewhere else, say in another tab, you'll see a clear message asking you to reload, not a vague "upload failed".

**Delete only shows up where it works.** A draft that has already been through review (sent in, then sent back or withdrawn, then edited again) can't be deleted. Its earlier versions are part of the review record. My Stories used to show a Delete button on these drafts anyway, and clicking it just failed. Now the button only shows on drafts you can actually delete. If deleting does fail for some reason, you'll see a plain explanation instead of a technical error.


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
