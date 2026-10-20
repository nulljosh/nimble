package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * BC Physical Geography 12 with no network: maps and time zones, Earth-sun relations, weather and climate, water,
 * landforms, rivers, glaciers, coasts, soils and biomes, plus map scale, time at another longitude and river
 * discharge. A port of `geo12()` in docs/engine.js; the tables are copied from there by script.
 */
internal object PhysicalGeography12 {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\bcontour lines? (?:are |that are )?(?:very )?close(?: together)?\b|\bclosely spaced contour""" to "The slope is steep: the land rises or falls a lot over a short distance, because each line marks one more step of elevation.",
        """\bcontour lines? (?:are |that are )?(?:very |widely |spread )?(?:far apart|wide apart|widely spaced|spread out)\b""" to "The slope is gentle or the land is nearly flat: the elevation changes only a little over a long distance.",
        """\bdegrees of longitude\b.*\bhour\b|\bhour\b.*\bdegrees of longitude\b""" to "15 degrees. Earth turns 360 degrees in 24 hours, so each hour of time is 360 ÷ 24 = 15 degrees of longitude.",
        """^(?:what causes |why (?:do|does) (?:we|earth) have |the cause of |what is the cause of )(?:the )?seasons\b|\bseasons (?:caused|happen)\b""" to "The tilt of Earth's axis, about 23.5 degrees. As Earth orbits the Sun, each hemisphere leans toward the Sun for part of the year (summer: higher sun, longer days, more direct energy) and away from it for the rest (winter). Distance from the Sun is not the cause.",
    ).map { Regex(it.first) to it.second }

    /** Landforms, weather and climate terms, matched as the whole term by Terms. */
    private val terms = listOf(
        """contour lines?""" to "A line on a topographic map that joins points of equal elevation. Close lines mean a steep slope, a closed loop marks a hill or a hollow, and the contour interval is the height between lines.",
        """contour interval""" to "The difference in elevation between two neighbouring contour lines on a map, such as 10 metres.",
        """(?:summer|june) solstice""" to "The day the Sun is overhead at the Tropic of Cancer (23.5 degrees north), around June 21: the longest day of the year in the Northern Hemisphere and the start of its summer.",
        """(?:sea|ocean|lake) breeze""" to "A cool daytime wind that blows from the sea onto the land. Land heats faster than water, so warm air rises over the land and cooler air from over the water flows in to replace it.",
        """orographic (?:precipitation|rain(?:fall)?|lifting|uplift)""" to "Rain or snow made when moist air is forced up the windward side of mountains: it cools as it rises, its water vapour condenses, and it falls as precipitation. BC's Coast Mountains get it from Pacific air.",
        """rain ?shadows?(?: effect)?""" to "The dry area on the leeward (downwind) side of a mountain range. Air drops its moisture on the windward side, then sinks and warms as it descends, so little rain falls beyond, like the Okanagan behind the Coast and Cascade Mountains.",
        """(?:river |stream )?discharge(?: of (?:a )?(?:river|stream))?""" to "The volume of water flowing past a point in a river each second, in cubic metres per second (m³/s). Discharge = cross-sectional area × velocity.",
        """ox-?bow lakes?""" to "A U-shaped lake left beside a river when the neck of a meander is cut off, often in a flood, and the river takes the shorter path.",
        """meanders?""" to "A broad loop or bend in a river. Water flows fastest on the outside of the bend and erodes it, and slowest on the inside, where it deposits sediment, so the loop grows over time.",
        """u-?shaped valleys?|glacial troughs?""" to "A wide valley with a flat floor and steep sides, carved when a glacier filled and eroded an older V-shaped river valley.",
        """v-?shaped valleys?""" to "A narrow valley with steep sides cut by a river eroding downward, typical of a river's upper course.",
        """hanging valleys?""" to "A smaller side valley left high above a main valley that a larger glacier deepened, often with a waterfall where it joins.",
        """aretes?|arêtes?""" to "A sharp, narrow ridge between two cirques or glacial valleys, carved by glaciers eroding on both sides.",
        """fjords?|fiords?""" to "A long, narrow, deep sea inlet with steep sides, a glacial valley later flooded by the sea, like Howe Sound in BC.",
        """mass (?:movement|wasting)""" to "The downslope movement of rock, soil and debris under gravity, such as rockfalls, landslides, mudflows and slow soil creep. Water, steep slopes and weak rock make it more likely.",
        """soil creep""" to "The very slow downhill movement of soil under gravity, shown by tilted fences, poles and tree trunks.",
        """spits?""" to "A long, narrow ridge of sand or shingle that sticks out from the coast into the sea, built by longshore drift where the coastline changes direction.",
        """longshore drift|littoral drift""" to "The movement of sand and shingle along a coast. Waves wash up the beach at an angle (swash) and drain straight back (backwash), so material zigzags along the shore.",
        """soil horizons?|soil layers?|soil profiles?""" to "A soil horizon is one layer of soil running parallel to the surface. A soil profile from top to bottom: O (organic litter), A (topsoil, with humus), B (subsoil, where minerals collect), C (weathered parent rock) and bedrock.",
        """(?:the )?tundra(?: biome)?""" to "A cold, treeless biome in the far north and on high mountains with permafrost, a short summer growing season, little precipitation, and plants like mosses, lichens, grasses and dwarf shrubs.",
        """permafrost""" to "Ground that stays frozen for at least two years in a row, found under tundra and in much of northern Canada.",
        """(?:the )?taiga|boreal forests?""" to "The biome of cold coniferous forest (spruce, fir, pine) across northern Canada and Russia, with long cold winters and short summers.",
        """alluvial fans?""" to "A fan-shaped deposit of sediment where a steep stream flows out onto flatter land and slows down.",
        """isobars?""" to "A line on a weather map that joins places with the same air pressure. Close isobars mean strong winds.",
        """air mass(?:es)?""" to "A large body of air with about the same temperature and humidity throughout, taking on the character of the region it formed over, such as maritime polar air from the north Pacific.",
        """topographic(?:al)? maps?|topo maps?""" to "A detailed map that shows the shape and height of the land with contour lines, along with rivers, roads, buildings and vegetation. In Canada the federal series is at 1:50,000 and 1:250,000.",
        """(?:winter|december) solstice""" to "The day the Sun is overhead at the Tropic of Capricorn (23.5 degrees south), around December 21: the shortest day of the year in the Northern Hemisphere and the start of its winter.",
        """(?:an )?equinox(?:es)?|(?:spring|vernal|fall|autumn(?:al)?|march|september) equinox""" to "One of the two days, around March 20 and September 22, when the Sun is overhead at the equator and day and night are about 12 hours each everywhere on Earth.",
        """insolation|incoming solar radiation""" to "Incoming solar radiation: the Sun's energy reaching Earth's surface. It is strongest where the Sun is high in the sky, near the equator and in summer.",
        """land breeze""" to "A cool night-time wind that blows from the land out to sea. Land cools faster than water at night, so air rises over the warmer sea and cooler air from the land flows out to replace it.",
        """convection(?:al)? (?:precipitation|rain(?:fall)?)""" to "Rain made when the ground heats the air above it, the warm air rises, cools and its water vapour condenses, often giving afternoon thunderstorms in hot places.",
        """frontal (?:precipitation|rain(?:fall)?)|cyclonic (?:precipitation|rain(?:fall)?)""" to "Rain made where a warm air mass meets a cold one: the lighter warm air is pushed up over the cold air along the front, cools, and its water vapour condenses.",
        """high(?:-| )pressure (?:system|area|zone|cell)s?|anticyclones?""" to "An area where air sinks toward the ground, so pressure is high. Sinking air warms and dries, giving clear skies and calm, fair weather. Winds spiral out of it, clockwise in the Northern Hemisphere.",
        """low(?:-| )pressure (?:system|area|zone|cell)s?|mid-latitude cyclones?""" to "An area where air rises, so pressure is low. Rising air cools and its water vapour condenses, giving clouds, rain and wind. Winds spiral into it, counterclockwise in the Northern Hemisphere.",
        """dew ?points?(?: temperature)?""" to "The temperature at which air becomes saturated, so its water vapour starts to condense into dew, fog or cloud. The closer the air temperature is to the dew point, the higher the relative humidity.",
        """infiltration""" to "The soaking of water from the surface down into the soil. It is slow on clay, frozen or paved ground, which makes more runoff.",
        """(?:the )?water tables?""" to "The top of the saturated zone underground, below which every gap in the soil and rock is full of groundwater. It rises after wet seasons and falls in droughts.",
        """(?:storm |flood )?hydrographs?""" to "A graph of a river's discharge over time, often with rainfall as bars. The lag time is the gap between peak rainfall and peak discharge.",
        """drumlins?""" to "A smooth, elongated hill of glacial till shaped like an upturned spoon, its long axis lined up with the direction the ice moved.",
        """cirques?|corries?|cwms?""" to "A bowl-shaped hollow on a mountainside carved by the head of a glacier, often holding a small lake (a tarn) after the ice melts.",
        """eskers?""" to "A long, winding ridge of sand and gravel laid down by a meltwater stream flowing under a glacier.",
        """sea stacks?""" to "A tall pillar of rock standing in the sea off a headland, left when waves erode a cave into an arch and the arch roof collapses.",
        """sea arch(?:es)?""" to "A natural arch through a headland, made when waves erode caves on both sides until they meet.",
        """headlands?""" to "A point of hard rock that juts out into the sea because it erodes more slowly than the softer rock beside it, which wears back into bays.",
        """(?:a )?beach(?:es)?""" to "A strip of sand, pebbles or shingle along a coast between low and high tide, deposited by waves where they lose energy.",
        """humus""" to "The dark, crumbly organic matter in soil made from decayed plants and animals. It holds water and nutrients and makes soil fertile.",
        """(?:tropical )?rain ?forests?(?: biome)?""" to "A hot, wet biome near the equator with rain all year (often over 2,000 mm), tall dense forest in layers and more species than any other biome.",
        """(?:the )?tropic of capricorn""" to "The line of latitude about 23.4 degrees south, the farthest south the Sun is ever directly overhead, on the December solstice.",
        """(?:the )?tropic of cancer""" to "The line of latitude about 23.4 degrees north, the farthest north the Sun is ever directly overhead, on the June solstice.",
        """(?:earth'?s )?axial tilt|(?:the )?tilt of (?:the )?earth(?:'s axis)?|obliquity""" to "The angle between Earth's axis and a line straight up from its orbit, about 23.4 degrees. It causes the seasons.",
        """(?:the )?(?:prevailing )?westerlies""" to "The prevailing winds of the mid-latitudes, between about 30 and 60 degrees, blowing from the west toward the east. They carry Pacific weather onto BC.",
        """cold fronts?""" to "The boundary where a cold air mass pushes under a warm one and lifts it sharply, bringing a sudden temperature drop, cumulonimbus cloud, heavy showers or thunderstorms, then clearer, cooler air.",
        """warm fronts?""" to "The boundary where a warm air mass slides up and over a retreating cold one, bringing a long spell of light, steady rain or drizzle and layered cloud, then warmer air.",
        """(?:the )?(?:environmental |normal )?lapse rates?""" to "The rate at which air temperature falls with height in the troposphere, about 6.5 °C for every 1,000 metres on average.",
        """(?:hot |cold )?deserts?(?: biome)?""" to "A biome with very little precipitation, under about 250 mm a year, so plants and animals are adapted to save water. Deserts can be hot, like the Sahara, or cold, like the Gobi.",
        """evapotranspiration""" to "The total water returned to the air from land: evaporation from soil and water plus transpiration from plants' leaves.",
        """(?:surface )?run-?off|overland flow""" to "Water from rain or snowmelt that flows over the land surface into streams instead of soaking in, greatest on steep, saturated, frozen or paved ground.",
        """tributar(?:y|ies)""" to "A smaller river or stream that flows into a larger one. The point where they meet is the confluence.",
        """confluences?""" to "The place where two rivers or streams meet and join.",
        """(?:the )?mouth of (?:a |the )?river|river mouths?""" to "Where a river ends by flowing into a sea, ocean, lake or larger river, often with a delta or estuary.",
        """(?:the )?source of (?:a |the )?river|river sources?""" to "Where a river begins, such as a spring, a lake, a glacier or rain-fed upland, usually high in its drainage basin.",
        """estuar(?:y|ies)""" to "The wide tidal mouth of a river where fresh water mixes with salt water from the sea, like the Fraser River estuary.",
        """river terraces?""" to "A flat step along a valley side, a piece of an old floodplain left high when the river cut down to a lower level.",
        """(?:glacial )?erratics?""" to "A boulder carried by a glacier and dropped far from where it came from, so it is a different rock from the ground it rests on.",
        """(?:glacial )?till|boulder clay""" to "Unsorted sediment, from clay to boulders, dropped straight from glacier ice without being sorted by water.",
        """oxidation(?: weathering)?""" to "Chemical weathering where oxygen reacts with minerals, especially iron, turning rock rusty red and making it crumble.",
        """wave[- ]?cut platforms?|wave[- ]?cut notch(?:es)?""" to "A flat, rocky shelf at the foot of a cliff, exposed at low tide, left as waves undercut the cliff and it retreats inland.",
        """coastal erosion""" to "The wearing away of the coast by waves, through hydraulic action, abrasion, attrition and solution. It makes cliffs, caves, arches and stacks.",
        """soil texture""" to "How much sand, silt and clay a soil holds. Sandy soil drains fast, clay holds water, and loam, a mix, is best for farming.",
        """loam""" to "Soil with a balanced mix of sand, silt and clay plus humus, which drains well and holds water and nutrients, ideal for farming.",
        """(?:temperate )?grasslands?(?: biome)?|prairies?|steppes?""" to "A biome of grasses with few trees, where rain is too light for forest but enough to stop desert, like the Canadian Prairies. Tropical grassland is savanna.",
        """(?:a )?natural hazards?""" to "A natural event, such as an earthquake, flood, wildfire, landslide or storm, that threatens people and property. It becomes a disaster when it causes major harm.",
        """latitude|lines? of latitude|parallels? of latitude""" to "How far a place is north or south of the equator, in degrees from 0 at the equator to 90 at the poles. Lines of latitude (parallels) run east to west.",
        """longitude|lines? of longitude""" to "How far a place is east or west of the prime meridian, in degrees from 0 to 180 east or west. Lines of longitude (meridians) run from pole to pole.",
        """(?:the )?prime meridian|greenwich meridian""" to "The line of 0 degrees longitude, running from pole to pole through Greenwich, England. Longitude is measured east and west from it.",
        """(?:the )?equator""" to "The line of 0 degrees latitude, halfway between the North and South Poles, dividing Earth into the Northern and Southern Hemispheres.",
        """(?:the )?arctic circle""" to "The line of latitude about 66.5 degrees north. North of it the Sun stays up for 24 hours on the June solstice and stays down for 24 hours on the December solstice.",
        """(?:the )?international date ?line""" to "An imaginary line, mostly along 180 degrees longitude in the Pacific, where the calendar date changes: crossing it westward you add a day, eastward you subtract one.",
        """(?:a )?map projections?""" to "A way of drawing the curved surface of Earth on a flat map. Every projection distorts something: area, shape, distance or direction.",
        """(?:the )?mercator(?: projection| map)?""" to "A cylindrical map projection from 1569 that keeps directions and shapes true, so it is used for navigation, but stretches areas toward the poles: Greenland looks as big as Africa.",
        """(?:the )?k(?:o|ö)ppen(?: climate)?(?: classification| system)?(?: of climates?)?""" to "A system that sorts the world's climates by temperature, precipitation and the vegetation they support into five main groups: A tropical, B dry, C temperate, D continental and E polar.",
        """albedo""" to "How much sunlight a surface reflects, from 0 (absorbs all) to 1 (reflects all). Fresh snow and ice have a high albedo; oceans, forests and asphalt have a low one.",
        """(?:the )?trade winds""" to "Steady winds that blow from the east toward the equator in the tropics, from about 30 degrees north and south, from the northeast in the Northern Hemisphere and the southeast in the Southern.",
        """monsoons?""" to "A seasonal shift in wind direction that brings a very wet season and a dry season, as in South Asia, where summer winds blow in from the Indian Ocean.",
        """moraines?""" to "A ridge or mound of till (rock debris) carried and deposited by a glacier: lateral moraines along its sides, medial where two glaciers meet, and terminal at its farthest point.",
        """fold mountains?""" to "Mountains made where two plates collide at a convergent boundary and squeeze layers of rock into folds, like the Rockies, the Himalayas and the Alps.",
        """flood ?plains?""" to "The wide, flat land beside a river that floods when the river overflows, built up from layers of fertile silt (alluvium) the floodwater leaves behind.",
        """levees?""" to "A raised bank along a river. Natural levees build up as floodwater drops its coarsest sediment next to the channel; people also build them to hold floods back, as along the Fraser.",
        """waterfalls?""" to "A place where a river drops over a steep step, often where hard rock lies over softer rock that erodes faster, so the fall slowly retreats upstream as a gorge.",
        """(?:an )?ice ages?|glacial periods?""" to "A long cold period when ice sheets and glaciers spread over large parts of Earth. In the last one, which ended about 11,700 years ago, ice covered almost all of Canada.",
        """karst(?: topography| landscape)?""" to "A landscape formed where rain and groundwater dissolve limestone, leaving sinkholes, caves, underground rivers and springs, as on northern Vancouver Island.",
        """landslides?""" to "A sudden, fast movement of rock, soil and debris down a slope under gravity, often set off by heavy rain, earthquakes, or cutting into the slope.",
        """temperate rain ?forests?(?: biome)?""" to "A cool, very wet forest biome on mid-latitude coasts, like BC's coast, with mild winters, heavy rain and huge, long-lived trees such as western red cedar, Douglas fir and Sitka spruce.",
        """(?:snow )?avalanches?""" to "A mass of snow, ice and debris sliding fast down a mountain slope, often set off by new snow, warming, wind loading or people, a major hazard in BC's mountains.",
        """el ni(?:n|ñ)o""" to "A warming of the surface water of the eastern tropical Pacific every few years that shifts weather worldwide, often giving BC a milder, drier winter.",
        """la ni(?:n|ñ)a""" to "A cooling of the surface water of the eastern tropical Pacific, the opposite of El Niño, often giving BC a colder, snowier winter.",
    ).map { Triple(Regex("^(?:" + it.first + ")$"), it.second, it.first) }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble geography")
    private fun p(v: Double) = pcNum(Precalc.sig(v, 6).toDouble())

    private val scale = Regex("""\b1\s*:\s*(\d[\d,]*)\b""")
    private val mapWord = Regex("""\bmaps?\b|\bscale\b""")
    private val mapLen = Regex("""(\d+(?:\.\d+)?)\s*(cm|centimet(?:re|er)s?|mm|millimet(?:re|er)s?)\b""")
    private val longitudes = Regex("""\b(noon|midnight|\d{1,2}(?::\d\d)?\s*(?:am|pm)?)\b.*?\b(\d+(?:\.\d+)?) degrees?(?: of)?(?: longitude)?(?: (east|west|e|w))?\b.*?\b(\d+(?:\.\d+)?) degrees?(?: of)?(?: longitude)?(?: (east|west|e|w))?\b""")
    private val area = Regex("""(\d+(?:\.\d+)?)\s*(?:square met(?:re|er)s?|m2|m²|sq m)\b""")
    private val speed = Regex("""(\d+(?:\.\d+)?)\s*(?:m/s|met(?:re|er)s? (?:per|a|each) second)\b""")

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        Terms.answer(q.replace(Regex(" in (?:physical )?geography$"), ""), terms, emptyList())?.let { return out(it) }
        // map scale 1:N: real distance = map distance × N ("scale is 1:N" stays with Foundations 12)
        scale.find(q)?.let { m ->
            val d = mapLen.find(q)
            val n = m.groupValues[1].replace(",", "").toDouble()
            if (mapWord.containsMatchIn(q) && !Regex("""\bscale (?:is |of )?1\s*:""").containsMatchIn(q) && d != null && n > 1) {
                val cm = d.groupValues[1].toDouble() * (if (d.groupValues[2].startsWith("m")) 0.1 else 1.0)
                val real = cm * n / 100
                val inM = Regex("""\bmet(?:re|er)s?\b""").containsMatchIn(q) && !Regex("""\bkilomet""").containsMatchIn(q)
                return out((if (inM) p(real) + " m" else p(real / 1000) + " km") + " (" + d.groupValues[1] + " " + d.groupValues[2].removeSuffix("s") + " × " + pcNum(n) + " = " + p(cm * n) + " cm on the ground).")
            }
        }
        // time at another longitude: 15 degrees an hour, later to the east
        longitudes.find(q)?.takeIf { Regex("""\btime\b""").containsMatchIn(q) }?.let { m ->
            val g = m.groupValues
            val t0 = when (g[1]) {
                "noon" -> 12.0
                "midnight" -> 0.0
                else -> {
                    val hm = g[1].replace(Regex("""\s*[ap]m"""), "").split(":")
                    (hm[0].toInt() % 12) + (if ("pm" in g[1]) 12 else 0) + (hm.getOrNull(1)?.toIntOrNull() ?: 0) / 60.0
                }
            }
            fun lon(d: String, s: String) = d.toDouble() * (if (s.startsWith("w")) -1 else 1)
            val dh = (lon(g[4], g[5]) - lon(g[2], g[3])) / 15
            val t = ((t0 + dh) % 24 + 24) % 24
            val h = floor(t).toInt()
            val mi = ((t - h) * 60).roundToInt()
            val lab = (if (h % 12 == 0) 12 else h % 12).toString() + (if (mi != 0) ":" + mi.toString().padStart(2, '0') else "") + (if (h < 12) " am" else " pm")
            return out(lab + " (" + pcNum(abs(dh)) + " hour" + (if (abs(dh) == 1.0) "" else "s") + (if (dh < 0) " earlier" else " later") + ": every 15 degrees of longitude is one hour, later to the east, earlier to the west).")
        }
        // river discharge Q = cross-sectional area × velocity
        if (Regex("""\bdischarge\b""").containsMatchIn(q)) {
            val a = area.find(q)
            val v = speed.find(q)
            if (a != null && v != null) return out(p(a.groupValues[1].toDouble() * v.groupValues[1].toDouble()) + " m³/s (discharge = area × velocity = " + a.groupValues[1] + " m² × " + v.groupValues[1] + " m/s).")
        }
        return null
    }
}
