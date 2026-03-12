#Introduction and context
We're launching a new hyperlocal engagement platform called chicago.com. You can find a loose description of our CEO's vision in the file ceo_interview.md in this workspace. You can find an outline of how I anticipate this working in the final version of this project in ellery_outline.md.

However, we're not building chicago.com right here. What we're building is some kind of interactive experience that will become the marketing page teasing the existence of chicago.com. Our CEO has a very ambitious timeline, so we're looking something that we could launch now that we coudl send people to on chicago.com that teases a bigger project is coming soon. You should use the aforementioned reports and the next_Gen_news_2_Report.pdf to inform the design decisions in this prototype, but we're not actually building chicago.com.

#The application
My plan is to build an interactive jigsaw puzzle using Chicago neighborhoods. You can find a GeoJSON file with the boundaries of Chicago neighborhoods in chicago_neighborhoods.geojson. The puzzle should use an appropriate projection that is centered in Chicago — it should not look skewed. Maybe AD83 StatePlane Illinois East (FIPS 1201 / EPSG 26971) for high-accuracy local mapping, or NAD83 UTM Zone 16N (EPSG 26916) for general-purpose, region-wide data.

The UI should be clean and simple. There will be no menu or multiple pages — just the puzzle. Please build this using React as a framework. This needs to be extremely mobile friendly — we anticipate the average user coming to it on their phones. It should accomodate dark and light modes. I've added some design standards in design-standards.md in this directory as a starting point, but you should prioritize the description in ceo_interview.md of the vibe/experience of the application over the design standards.

The jigsaw puzzle should break up the GeoJSON file as individual jigsaw pieces; each jigsaw piece is a neighborhood. There should be an outline of the city so users roughly know where each piece should go. The neighborhood puzzle pieces should be randomly positioned but not rotated. They can overlap. When a user drags a neighborhood to the correct position within the outline of the map, it should "snap" into place.

I'd suggest using Pixi.JS or some other graphics library to ensure the graphics load quickly and responsively: https://pixijs.com/8.x/guides/getting-started/intro

When the user correctly completes the puzzle, they should receive a pop-up congratulating them and then ask them to put in their email to join a beta testing group and receive updates on what we're building with chicago.com.

There should be persistence — utilize browser cookie storage. If someone has completed the puzzle before, they should just encounter a completed puzzle and the pop-up asking them to put in their email.

We will want to implement robust tracking on this. Ideally, we would like 