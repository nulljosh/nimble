package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.pow

/**
 * BC Earth Sciences 11 with no network: minerals and rocks, Earth's layers, plate tectonics, earthquakes and volcanoes,
 * geologic time, weathering and erosion, the atmosphere, oceans and climate, plus radiometric dating, earthquake
 * magnitude and epicentre distance. A port of `es11()` in docs/engine.js; the tables are copied from there by script.
 */
internal object EarthSciences11 {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\b(?:three |3 |main )?(?:types|kinds|classes) of rocks?\b""" to "Igneous, sedimentary and metamorphic.",
        """\bhardest (?:natural )?mineral\b""" to "Diamond, 10 on the Mohs scale.",
        """\bsoftest mineral\b""" to "Talc, 1 on the Mohs scale.",
        """\bmost (?:common|abundant) minerals?\b.*\bcrust\b|\bcrust'?s? most (?:common|abundant) mineral\b""" to "Feldspar, about half of the crust. Quartz is next.",
        """\bintrusive\b.*\bextrusive\b|\bextrusive\b.*\bintrusive\b""" to "Intrusive (plutonic) igneous rock cools slowly inside the Earth, below the surface, so it has large crystals, like granite. Extrusive (volcanic) rock cools fast on the surface, so its crystals are small or absent, like basalt and obsidian.",
        """\bmagma\b.*\blava\b|\blava\b.*\bmagma\b""" to "Magma is molten rock underground, below the surface. Once it erupts onto the surface it is called lava.",
        """\bweathering\b.*\berosion\b|\berosion\b.*\bweathering\b""" to "Weathering breaks rock down into smaller pieces where it sits. Erosion then moves (transports) those pieces away by water, wind, ice or gravity.",
        """\bweather\b.*\bclimate\b|\bclimate\b.*\bweather\b""" to "Weather is the short-term state of the atmosphere, over hours or days. Climate is the long-term average weather of a region, usually over 30 years or more.",
        """\blayers of (?:the )?earth\b|\bearth'?s (?:layers|structure|interior)\b""" to "Crust, mantle, outer core and inner core, from the surface in. By strength, the rigid lithosphere sits on the soft asthenosphere.",
        """\blayers of (?:the )?atmosphere\b|\batmospher(?:e|ic) layers\b""" to "Troposphere, stratosphere, mesosphere, thermosphere and exosphere, from the ground up.",
        """\bwho (?:proposed|came up with|developed|suggested)\b.*\bcontinental drift\b|\bfather of continental drift\b""" to "Alfred Wegener, a German scientist, in 1912.",
        """\bevidence (?:for|of|supporting) (?:continental drift|plate tectonics|pangaea)\b""" to "The continents fit together like puzzle pieces, matching fossils (Mesosaurus, Glossopteris) and rock types and mountain ranges line up across oceans, and glacial scratches and coal sit in places now far too warm or cold for them. Later: sea floor spreading and magnetic stripes.",
        """\bwhat (?:drives|causes|moves) (?:the )?(?:plates?|plate motion|plate movement|tectonic plates)\b""" to "Convection currents in the mantle, along with slab pull (sinking plates dragging the rest) and ridge push at mid-ocean ridges.",
        """\bs[- ]waves?\b.*\b(?:outer core|liquid)\b""" to "S waves are shear waves and travel only through solids. The outer core is liquid, so they stop there, which is how we know it is liquid.",
        """\bcontinental[- ]continental\b|\btwo continental plates\b""" to "Huge folded mountain ranges, like the Himalayas: neither plate is dense enough to subduct, so the crust crumples.",
        """\boceanic[- ]oceanic\b|\btwo oceanic plates\b""" to "A deep ocean trench and a curved chain of volcanic islands (an island arc), like Japan or the Aleutians, as one plate subducts.",
        """\boceanic[- ]continental\b|\bcontinental[- ]oceanic\b""" to "The oceanic plate subducts, making a trench offshore and a range of volcanic mountains on land, like the Cascades and the Andes.",
        """\bexamples? of (?:a )?transform (?:boundary|fault|plate boundary)\b""" to "The San Andreas Fault in California. In BC, the Queen Charlotte Fault off Haida Gwaii.",
        """\bexamples? of (?:a )?divergent (?:boundary|plate boundary)\b""" to "The Mid-Atlantic Ridge, and the East African Rift on land.",
        """\bexamples? of (?:a )?convergent (?:boundary|plate boundary)\b""" to "The Cascadia subduction zone off BC, the Andes, and the Himalayas.",
        """\bhow many (?:seismograph|seismic|recording) stations\b|\bstations\b.*\b(?:locate|find|needed)\b.*\bepicent""" to "Three. Each station's S minus P time gap gives its distance, and the three circles meet at the epicentre (triangulation).",
        """\bwhat (?:geologic(?:al)? )?era\b.*\b(?:we|now|today|current)\b|\bcurrent (?:geologic(?:al)? )?era\b""" to "The Cenozoic Era, in the Quaternary Period and the Holocene Epoch.",
        """\b(?:geologic(?:al)? )?eras\b|\bfour eras\b""" to "Precambrian time, then the Paleozoic, Mesozoic (the age of dinosaurs) and Cenozoic eras.",
        """\bthinnest layer of (?:the )?earth\b""" to "The crust, about 7 km thick under the oceans and 35 km under the continents.",
        """\bthickest layer of (?:the )?earth\b""" to "The mantle, about 2900 km thick.",
        """\bhow hot is (?:the )?(?:earth'?s )?(?:inner )?core\b|\btemperature of (?:the )?(?:earth'?s )?(?:inner )?core\b""" to "About 5400 °C at the inner core, about as hot as the surface of the Sun.",
        """\bwhy is (?:the )?inner core solid\b""" to "The enormous pressure at the centre of the Earth keeps the iron solid even at about 5400 °C.",
        """\bplate\b.*\b(?:off|near|under|beneath) (?:the )?(?:coast of )?(?:bc|british columbia|vancouver island)\b""" to "The Juan de Fuca Plate, which subducts under the North American Plate at the Cascadia subduction zone.",
        """\bolder\b.*\bfault\b|\bfault\b.*\bolder\b|\bcuts? (?:through|across)\b.*\b(?:older|younger)\b""" to "The rock layer is older; the fault that cuts through it is younger (cross-cutting relationships).",
        """\bdinosaurs?\b.*\b(?:extinct|die|died|disappear)""" to "About 66 million years ago, at the end of the Cretaceous, most likely after an asteroid hit near Chicxulub, Mexico.",
        """\bglaciers?\b.*\bvalleys?\b|\bvalleys?\b.*\bglaciers?\b""" to "U-shaped valleys. Rivers carve V-shaped ones.",
        """\b(?:gas(?:es)?|composition|percent(?:age)?)\b.*\batmosphere\b|\batmosphere\b.*\b(?:made of|composition|gases)\b""" to "Nitrogen about 78 percent, oxygen about 21 percent, argon about 0.9 percent, and carbon dioxide about 0.04 percent, plus water vapour.",
        """\bhigh[- ]pressure\b.*\blow[- ]pressure\b|\blow[- ]pressure\b.*\bhigh[- ]pressure\b""" to "In a high pressure system air sinks and warms, so skies are clear and the weather fair. In a low pressure system air rises and cools, so clouds, rain and storms form.",
    ).map { Regex(it.first) to it.second }

    /** Structures and ideas, matched as the whole term by Terms. */
    private val terms = listOf(
        """igneous(?: rocks?)?""" to "Rock formed when magma or lava cools and hardens. Intrusive rock cools slowly underground and has large crystals, like granite; extrusive rock cools fast at the surface and has small or no crystals, like basalt and obsidian.",
        """sedimentary(?: rocks?)?""" to "Rock formed from sediments (bits of rock, shells or minerals) deposited in layers, then compacted and cemented together, like sandstone, shale and limestone. It is the only rock type with fossils.",
        """metamorphic(?: rocks?)?""" to "Rock changed by heat and pressure deep underground without melting, like marble (from limestone), slate (from shale) and gneiss (from granite).",
        """metamorphism""" to "The change of existing rock into metamorphic rock by heat, pressure and hot fluids, without melting.",
        """(?:the )?rock cycle""" to "The slow cycle by which rocks change type: igneous, sedimentary and metamorphic rock are weathered, buried, heated, squeezed, melted and cooled into one another over millions of years.",
        """minerals?""" to "A naturally occurring, inorganic solid with a definite chemical composition and an orderly crystal structure, like quartz or feldspar.",
        """(?:the )?mohs(?: hardness)?(?: scale)?""" to "A 1 to 10 scale of mineral hardness by scratch test: talc 1, gypsum 2, calcite 3, fluorite 4, apatite 5, feldspar 6, quartz 7, topaz 8, corundum 9, diamond 10.",
        """streak""" to "The colour of a mineral's powder, seen by rubbing it on an unglazed porcelain streak plate. It is more reliable than surface colour.",
        """lust(?:er|re)""" to "How a mineral's surface shines in reflected light: metallic, like pyrite, or non-metallic, such as glassy, pearly, silky or dull.",
        """cleavage(?: in minerals)?""" to "The way a mineral breaks cleanly along flat planes of weakness, like mica splitting into sheets.",
        """fracture(?: in minerals)?""" to "Breaking along rough or curved surfaces instead of flat planes, like the shell-shaped (conchoidal) fracture of quartz.",
        """hardness(?: of a mineral)?""" to "A mineral's resistance to being scratched, measured on the Mohs scale.",
        """magma""" to "Molten (melted) rock below the Earth's surface. Once it erupts it is called lava.",
        """lava""" to "Molten rock that has reached the Earth's surface.",
        """(?:the )?crust""" to "Earth's thin, rocky outer layer: continental crust (mostly granite, about 35 km thick) and oceanic crust (basalt, about 7 km thick).",
        """(?:the )?mantle""" to "The thick layer of hot rock between the crust and the core, about 2900 km deep. It is solid but flows slowly, and its convection currents move the plates.",
        """(?:the )?outer core""" to "A liquid layer of molten iron and nickel about 2300 km thick. Its flow makes Earth's magnetic field.",
        """(?:the )?inner core""" to "A solid ball of iron and nickel at the centre, about 5400 °C, kept solid by enormous pressure.",
        """(?:the )?core""" to "Earth's centre, mostly iron and nickel: a liquid outer core around a solid inner core.",
        """(?:the )?lithosphere""" to "The rigid outer shell of crust and uppermost mantle, broken into tectonic plates.",
        """(?:the )?asthenosphere""" to "The soft, partly molten (plastic) layer of upper mantle beneath the lithosphere, on which the plates slide.",
        """(?:the )?(?:theory of )?plate tectonics""" to "The theory that Earth's lithosphere is broken into plates that move slowly over the asthenosphere, driven by mantle convection, causing earthquakes, volcanoes and mountains at their boundaries.",
        """(?:tectonic )?plates?""" to "A large slab of lithosphere that moves a few centimetres a year.",
        """continental drift""" to "Alfred Wegener's 1912 idea that the continents were once joined in Pangaea and have slowly drifted apart.",
        """pangaea|pangea""" to "The supercontinent that held all the continents about 300 to 200 million years ago, before it broke apart.",
        """divergent (?:plate )?boundar(?:y|ies)""" to "Plates move apart. Magma rises to make new crust, forming mid-ocean ridges like the Mid-Atlantic Ridge, or rift valleys on land like the East African Rift.",
        """convergent (?:plate )?boundar(?:y|ies)""" to "Plates move together and collide. Oceanic crust subducts beneath the other plate, making trenches and volcanoes; two continents crumple into mountains like the Himalayas.",
        """transform (?:plate )?boundar(?:y|ies)|transform faults?""" to "Plates slide past each other sideways, causing earthquakes but making or destroying no crust, like the San Andreas Fault.",
        """subduction(?: zones?)?""" to "One plate, the denser oceanic one, sinks beneath another into the mantle, forming a deep trench and volcanoes.",
        """sea ?floor spreading|seafloor spreading""" to "New oceanic crust forms at mid-ocean ridges as magma rises and the plates move apart, so the sea floor is youngest at the ridge. Harry Hess proposed it in the 1960s.",
        """mid-?ocean ridges?""" to "An underwater mountain chain at a divergent boundary, where new oceanic crust forms.",
        """(?:ocean(?:ic)? )?trench(?:es)?""" to "A deep, narrow valley in the ocean floor where one plate subducts beneath another.",
        """hot ?spots?""" to "A plume of hot mantle rising under a plate, making a chain of volcanoes as the plate moves over it, like Hawaii.",
        """(?:mantle )?convection currents?""" to "Circulation in the mantle: hot rock rises, cools and sinks, dragging the plates along.",
        """earthquakes?""" to "Sudden shaking when rock breaks and slips along a fault, releasing stored energy as seismic waves.",
        """faults?""" to "A break in the crust where rocks move past each other.",
        """(?:the )?(?:focus|hypocent(?:er|re))(?: of an earthquake)?""" to "The point inside the Earth where an earthquake starts, where the rock first breaks.",
        """(?:the )?epicent(?:er|re)(?: of an earthquake)?""" to "The point on the surface directly above an earthquake's focus.",
        """p[- ]waves?|primary waves?""" to "Primary waves, the fastest seismic waves (about 6 km/s in the crust). They compress and stretch rock in the direction they travel and pass through solids, liquids and gases.",
        """s[- ]waves?|secondary waves?""" to "Secondary waves, slower than P waves (about 3.5 km/s). They shake rock side to side (shear) and travel only through solids, so they cannot cross the liquid outer core.",
        """surface waves?""" to "Seismic waves that travel along the surface, the slowest and most damaging.",
        """seismic waves?""" to "Waves of energy from an earthquake: P waves, S waves and surface waves.",
        """seismographs?|seismometers?""" to "An instrument that records ground shaking from seismic waves.",
        """(?:the )?(?:richter|moment magnitude) scale|magnitude""" to "A scale of earthquake size: each whole number up is 10 times the wave amplitude and about 32 times the energy.",
        """tsunamis?""" to "A series of huge ocean waves caused by an undersea earthquake, landslide or eruption that shoves a large volume of water.",
        """volcano(?:es)?""" to "An opening in the crust where magma, gas and ash erupt.",
        """shield volcano(?:es)?""" to "A broad volcano with gentle slopes built from runny, low-viscosity basalt lava, like Mauna Loa in Hawaii. Its eruptions are mostly quiet.",
        """(?:composite|strato) ?volcano(?:es)?|stratovolcano(?:es)?""" to "A tall, steep cone (a stratovolcano) built of layers of lava and ash, with thick, gassy magma that erupts explosively, like Mount St. Helens and Mount Fuji.",
        """cinder cones?(?: volcano(?:es)?)?""" to "A small, steep volcano built from loose cinders thrown out in one eruption.",
        """(?:the )?ring of fire""" to "The chain of volcanoes and earthquakes around the Pacific Ocean along its subduction zones. It holds about 75 percent of the world's volcanoes.",
        """(?:the )?(?:law |principle )?(?:of )?superposition""" to "In undisturbed layers of sedimentary rock, the bottom layers are the oldest and each layer above is younger.",
        """(?:the )?(?:law |principle )?(?:of )?cross-?cutting(?: relationships)?""" to "A rock body or fault that cuts across other layers is younger than the layers it cuts.",
        """(?:the )?(?:law |principle )?(?:of )?original horizontality""" to "Sediments are laid down in flat, horizontal layers, so tilted or folded layers were disturbed later.",
        """relative dating|relative age""" to "Putting rocks and events in order, older or younger, without exact ages, using superposition, cross-cutting and fossils.",
        """(?:absolute|radiometric|radioactive) dating|absolute age""" to "Finding a rock's age in years from the decay of radioactive isotopes, such as uranium-238 or carbon-14, at their known half-lives.",
        """index fossils?""" to "A fossil of an organism that lived for a short time but spread widely, so it dates the rock layers it is found in.",
        """(?:the )?geologic(?:al)? time(?: scale)?""" to "The calendar of Earth's 4.6 billion year history, divided into eons, eras, periods and epochs, marked by big changes in life and rock.",
        """unconformit(?:y|ies)""" to "A gap in the rock record where layers were eroded away or never laid down.",
        """weathering""" to "The breaking down of rock into smaller pieces where it sits, by physical (mechanical) or chemical processes.",
        """mechanical weathering|physical weathering""" to "Breaking rock into smaller pieces without changing what it is made of, by frost wedging, plant roots, abrasion or heating and cooling.",
        """chemical weathering""" to "Breaking down rock by chemical reactions that change its minerals: acid rain dissolving limestone, oxidation (rusting) of iron, feldspar turning to clay.",
        """(?:frost|ice) wedging""" to "Water seeps into cracks, freezes and expands by about 9 percent, prying the rock apart over many cycles.",
        """erosion""" to "The moving (transport) of weathered rock and soil by water, wind, ice or gravity.",
        """deposition""" to "Sediment being dropped (laid down) when the water, wind or ice carrying it slows down.",
        """glaciers?""" to "A huge, slow-moving mass of ice that erodes valleys into U shapes and leaves deposits of rock (till) when it melts.",
        """(?:the )?troposphere""" to "The lowest layer of the atmosphere, from the ground to about 12 km, where weather happens and temperature falls with height.",
        """(?:the )?stratosphere""" to "The layer from about 12 to 50 km up that holds the ozone layer; temperature rises with height.",
        """(?:the )?mesosphere""" to "The layer from about 50 to 85 km up, the coldest, where meteors burn up.",
        """(?:the )?thermosphere""" to "The layer from about 85 to 600 km up, very thin and very hot, where auroras happen and the space station orbits.",
        """(?:the )?exosphere""" to "The outermost layer of the atmosphere, fading into space.",
        """(?:the )?ozone(?: layer)?""" to "A layer of ozone (O₃) in the stratosphere, about 15 to 35 km up, that absorbs most of the Sun's harmful ultraviolet (UV) radiation.",
        """(?:the )?coriolis(?: effect| force)?""" to "Earth's rotation deflects moving air and water, to the right in the Northern Hemisphere and to the left in the Southern, curving winds and ocean currents.",
        """(?:the )?greenhouse effect""" to "Gases such as carbon dioxide, water vapour and methane let sunlight in but trap the heat Earth gives off, keeping the planet warm. Adding more of them causes global warming.",
        """greenhouse gas(?:es)?""" to "A gas that traps heat in the atmosphere: carbon dioxide, methane, water vapour and nitrous oxide.",
        """weather""" to "The state of the atmosphere at a place and time (temperature, wind, clouds, precipitation) over hours to days.",
        """climate""" to "The average weather of a region over a long time, usually 30 years or more.",
        """(?:weather )?fronts?(?: in weather)?""" to "The boundary between two air masses of different temperature and humidity, where clouds and storms often form. Cold fronts bring short, heavy rain; warm fronts bring longer, gentle rain.",
        """air mass(?:es)?""" to "A huge body of air with about the same temperature and humidity throughout.",
        """relative humidity""" to "How much water vapour the air holds compared with the most it could hold at that temperature, as a percent.",
        """(?:the )?water cycle|hydrologic cycle""" to "Water evaporates from oceans and lakes, transpires from plants, condenses into clouds, falls as precipitation, and flows back as runoff and groundwater, powered by the Sun.",
        """tides?""" to "The regular rise and fall of sea level, about twice a day, caused mainly by the Moon's gravity pulling on the oceans, with help from the Sun.",
        """ocean currents?|currents""" to "Large flows of ocean water driven by wind at the surface and by differences in temperature and salinity (density) in the deep ocean, and turned by the Coriolis effect.",
        """el ni(?:n|ñ)o""" to "A warming of the eastern tropical Pacific every few years that shifts weather worldwide; BC gets a milder, drier winter.",
        """groundwater""" to "Water held underground in the cracks and pores of soil and rock.",
        """aquifers?""" to "An underground layer of porous rock or sediment that holds and lets through groundwater.",
        """rift valleys?""" to "A long valley where the crust is pulling apart at a divergent boundary on land, like the East African Rift.",
        """(?:the )?cascadia subduction zone""" to "The boundary off the coast of BC, Washington and Oregon where the Juan de Fuca Plate subducts under the North American Plate. It can make magnitude 9 earthquakes; the last was in 1700.",
        """calderas?""" to "A large basin that forms when a volcano's summit collapses into the emptied magma chamber after an eruption, like Crater Lake.",
        """pyroclastic flows?""" to "A fast, ground-hugging avalanche of hot gas, ash and rock from an explosive eruption, hundreds of degrees hot and deadly.",
        """uniformitarianism""" to "The idea that the same slow processes we see today shaped Earth in the past: the present is the key to the past. James Hutton proposed it.",
        """oxidation(?: in weathering)?""" to "Chemical weathering where oxygen reacts with iron in minerals, making rust-coloured iron oxides that crumble.",
        """deltas?""" to "A fan of sediment deposited at the mouth of a river where it slows into a lake or ocean, like the Fraser River delta.",
        """hurricanes?|typhoons?|tropical cyclones?""" to "A huge rotating tropical storm with a low pressure centre (the eye) and winds over 119 km/h, powered by warm ocean water.",
        """global warming|climate change""" to "The rise in Earth's average temperature since the 1800s, mainly from greenhouse gases released by burning fossil fuels, which strengthen the greenhouse effect.",
        """(?:the )?jet streams?""" to "Fast, narrow bands of wind high in the troposphere, about 10 km up, that steer weather systems from west to east.",
        """soils?""" to "A mix of weathered rock particles (sand, silt, clay), organic matter (humus), water and air, built up in layers called horizons.",
        """thermohaline circulation|(?:the )?(?:global )?ocean conveyor belt""" to "The slow, deep circulation of the world's oceans driven by differences in temperature and salinity, which change water density: cold, salty water sinks near the poles and spreads along the ocean floor.",
        """fossil fuels?""" to "Coal, oil and natural gas, formed over millions of years from the buried remains of ancient plants and sea life.",
        """crystals?""" to "A solid whose atoms are arranged in an orderly, repeating pattern, giving it flat faces.",
    ).map { Triple(Regex("^(?:" + it.first + ")$"), it.second, it.first) }

    private val kinds = listOf(
        """layers? of (?:the )?atmosphere|atmospher(?:e|ic) layers?|layers? in the atmosphere""" to """troposphere|stratosphere|mesosphere|thermosphere|exosphere""",
        """layers? of (?:the )?earth|layers? inside the earth""" to """crust|mantle|outer core|inner core|lithosphere|asthenosphere""",
        """(?:type of |kind of )?(?:plate )?boundar(?:y|ies)""" to """^(?:divergent|convergent|transform)""",
        """(?:type of |kind of )?(?:seismic |earthquake )?waves?""" to """p\[- \]waves|s\[- \]waves|surface waves""",
        """(?:type of |kind of )?volcano(?:es)?""" to """shield|composite|cinder""",
        """(?:type of |kind of )?rocks?""" to """^(?:igneous|sedimentary|metamorphic)\(""",
        """(?:type of |kind of )?weathering""" to """weathering""",
    )

    /** Common rocks: type, then how it forms. */
    private val rocks = mapOf(
        "granite" to "Igneous (intrusive): coarse crystals from magma that cooled slowly underground.",
        "basalt" to "Igneous (extrusive): fine-grained, from lava that cooled quickly. It makes up the ocean floor.",
        "obsidian" to "Igneous (extrusive): volcanic glass from lava that cooled almost instantly.",
        "pumice" to "Igneous (extrusive): frothy volcanic rock full of gas holes, light enough to float.",
        "rhyolite" to "Igneous (extrusive): fine-grained, the volcanic match of granite.",
        "andesite" to "Igneous (extrusive): from the volcanoes of subduction zones.",
        "gabbro" to "Igneous (intrusive): the coarse-grained match of basalt.",
        "diorite" to "Igneous (intrusive): coarse, speckled black and white.",
        "sandstone" to "Sedimentary: cemented sand grains.",
        "shale" to "Sedimentary: compacted mud and clay in thin layers.",
        "limestone" to "Sedimentary: calcite, often from shells and coral.",
        "conglomerate" to "Sedimentary: rounded pebbles cemented together.",
        "breccia" to "Sedimentary: sharp, angular pieces cemented together.",
        "siltstone" to "Sedimentary: cemented silt.",
        "coal" to "Sedimentary (organic): compressed plant remains.",
        "chalk" to "Sedimentary: tiny marine shells.",
        "marble" to "Metamorphic: from limestone.",
        "slate" to "Metamorphic: from shale, splitting into flat sheets.",
        "schist" to "Metamorphic: shiny and flaky with mica, from shale or slate under more heat.",
        "gneiss" to "Metamorphic: banded light and dark, from granite or schist.",
        "quartzite" to "Metamorphic: from sandstone.",
        "phyllite" to "Metamorphic: between slate and schist, with a silky sheen.",
    )

    /** Mohs hardness of common minerals and test objects. */
    private val hardness = mapOf(
        "talc" to "1",
        "gypsum" to "2",
        "calcite" to "3",
        "fluorite" to "4",
        "apatite" to "5",
        "feldspar" to "6",
        "orthoclase" to "6",
        "orthoclase feldspar" to "6",
        "quartz" to "7",
        "topaz" to "8",
        "corundum" to "9",
        "diamond" to "10",
        "fingernail" to "about 2.5",
        "a fingernail" to "about 2.5",
        "copper penny" to "about 3.5",
        "a copper penny" to "about 3.5",
        "glass" to "about 5.5",
        "steel nail" to "about 6.5",
        "a steel nail" to "about 6.5",
    )

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun p(v: Double, digits: Int) = pcNum(Precalc.sig(v, digits).toDouble())

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // what type of rock is granite
        m = find("""\b(?:type|kind|class) of rock (?:is|are) (?:an? )?([a-z]+)$""", q) ?: find("""^is ([a-z]+) (?:an? )?(?:igneous|sedimentary|metamorphic)\b""", q)
            ?: find("""^(?:what (?:type|kind) of rock is )?([a-z]+) rock type$""", q)
        if (m != null) rocks[m[1]]?.let { return out(it) }
        m = find("""\bhardness of (?:a |an )?([a-z ]+)$""", q)
        if (m != null) hardness[m[1]]?.let { return out("$it on the Mohs scale.") }
        Terms.answer(q, terms, kinds)?.let { return out(it) }
        // radiometric dating: age = half-lives elapsed × half-life, half-lives = log2(original / left)
        val hl = find("""\bhalf[- ]life (?:of (?:[a-z]+-\d+ )?)?(?:is |=)?\s*(\d+(?:\.\d+)?)\s*(billion years|million years|years?|days?|hours?|minutes?|seconds?)\b""", q)
        if (hl != null && has("""\b(?:old|age)\b""", q)) {
            val pct = find("""(\d+(?:\.\d+)?)\s*%""", q)
            val frac = find("""\b(\d+)/(\d+)\b""", q)
            val left = pct?.let { it[1].toDouble() / 100 } ?: frac?.let { it[1].toDouble() / it[2].toDouble() }
            if (left != null && left > 0 && left < 1) {
                val n = log2(1 / left)
                val u = hl[2].replace(Regex("^(year|day|hour|minute|second)$"), "$1s")
                return out(p(n * hl[1].toDouble(), 6) + " " + u + " (" + p(n, 4) + (if (n == 1.0) " half-life of " else " half-lives of ") + hl[1] + " " + u + ")")
            }
        }
        // earthquake magnitude: each step is 10 times the amplitude and 10^1.5 (about 32) times the energy
        m = find("""\bmagnitude (\d+(?:\.\d+)?)\b.*?\b(?:magnitude |an? )(\d+(?:\.\d+)?)\b""", q)
        if (m != null) {
            val d = abs(m[1].toDouble() - m[2].toDouble())
            val a = "Amplitude: " + p(10.0.pow(d), 3) + " times (10 per magnitude step)."
            val e = "Energy: about " + p(10.0.pow(1.5 * d), 3) + " times (about 32 per step)."
            return out(if (has("""\benerg""", q)) "$e $a" else "$a $e")
        }
        // epicentre distance from the S minus P gap, with P at 6 km/s and S at 3.5 km/s in the crust
        if (has("""\bepicent|\bhow far\b|\bdistance\b""", q) && has("""\b(?:s[- ]p|p[- ]s|s minus p|lag|gap|difference|arrive)\b""", q)) {
            m = find("""(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b""", q)
            if (m != null) return out("About " + p(m[1].toDouble() * 8.4, 3) + " km (gap × 8.4 km/s, with P waves at 6 km/s and S waves at 3.5 km/s; a travel-time chart gives a closer value).")
        }
        return null
    }
}
