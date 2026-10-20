package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * BC Environmental Science 11 with no network: ecosystems and energy flow, biogeochemical cycles, biodiversity,
 * succession, population dynamics, species interactions, ecosystem services, human impacts and conservation, plus the
 * 10 percent rule, population density, mark and recapture, growth rate and doubling time. A port of `env11()` in
 * docs/engine.js; the tables are copied from there by script.
 */
internal object EnvironmentalScience11 {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\bbiotic\b.*\babiotic\b|\babiotic\b.*\bbiotic\b""" to "Biotic factors are the living parts of an ecosystem: plants, animals, fungi and bacteria. Abiotic factors are the non-living parts: sunlight, temperature, water, soil, air and nutrients.",
        """\b(?:10|ten) ?(?:percent|%) (?:rule|law)\b|\brule of (?:10|ten)\b""" to "Only about 10 percent of the energy at one trophic level passes on to the next; the other 90 percent is used for life processes or lost as heat. That is why food chains rarely have more than four or five links.",
        """\b(?:three |3 |main )?(?:levels|types|kinds|components) of biodiversity\b""" to "Genetic diversity (the variety of genes within a species), species diversity (the variety of species in an area) and ecosystem diversity (the variety of habitats and ecosystems).",
        """\bdensity[- ]dependent\b.*\bdensity[- ]independent\b|\bdensity[- ]independent\b.*\bdensity[- ]dependent\b""" to "Density-dependent factors grow stronger as a population gets more crowded: competition, disease, predation and parasites. Density-independent factors hit a population the same way whatever its size: weather, fire, floods, drought and other natural disasters.",
        """\brenewable\b.*\bnon-?renewable\b|\bnon-?renewable\b.*\brenewable\b""" to "Renewable resources are replaced (replenished) naturally within a human lifetime, like sunlight, wind, water, and forests and fish if harvested sustainably. Non-renewable resources take millions of years to form, so their supply is finite and they can run out: coal, oil, natural gas and minerals.",
        """\bwhy (?:are|do) food chains\b|\bfood chains?\b.*\b(?:short|few links|so few)\b""" to "Only about 10 percent of the energy passes from one trophic level to the next; the rest is used or lost as heat, so after four or five levels too little energy is left to support another.",
        """\bphotosynthesis\b.*\bcarbon cycle\b|\bcarbon cycle\b.*\bphotosynthesis\b""" to "Photosynthesis removes carbon dioxide from the air and stores the carbon in sugars and plant tissue. Respiration, decomposition and burning return it to the air.",
        """\bhumans?\b.*\bcarbon cycle\b|\bhuman (?:impacts?|activit(?:y|ies))\b.*\bcarbon\b""" to "Burning fossil fuels and deforestation release carbon dioxide faster than plants and the oceans can absorb it, so CO₂ builds up in the atmosphere and warms the climate.",
        """\bwhy do (?:plants|organisms|living things|animals) need nitrogen\b|\bnitrogen\b.*\b(?:needed|important) (?:for|to)\b""" to "To build proteins (from amino acids), DNA and RNA, and the chlorophyll in plants.",
        """\bwhy is biodiversity important\b|\bimportance of biodiversity\b|\bwhy (?:does|should) biodiversity matter\b""" to "More diverse ecosystems are more stable and resilient: they recover better from disturbance. Biodiversity also gives us ecosystem services and resources such as food, medicine, clean water, pollination and timber.",
        """\bkeystone species\b.*\b(?:bc|british columbia|examples?)\b|\bexamples? of (?:a )?keystone species\b""" to "Pacific salmon (their bodies feed bears, eagles and the forest itself), sea otters (they keep sea urchins from wiping out kelp forests), beavers and grey wolves.",
        """\binvasive species\b.*\b(?:bc|british columbia|examples?)\b|\bexamples? of (?:an )?invasive species\b""" to "Scotch broom, Himalayan blackberry, Japanese knotweed, purple loosestrife, European green crab, American bullfrog and European starling. Zebra and quagga mussels are kept out so far by boat inspections.",
        """\b(?:after|following) a (?:forest |wild)?fire\b|\b(?:forest |wild)fire\b.*\b(?:after|happens|recover)""" to "Secondary succession: the soil survives, so fireweed, grasses and shrubs regrow within months, then fast-growing trees like lodgepole pine and aspen, and over decades a mature forest again. The ash also returns nutrients to the soil.",
        """\bsource of (?:all )?(?:the )?energy\b.*\b(?:ecosystems?|food chains?|food webs?|life|living things|earth)\b""" to "The Sun. Producers capture its light energy by photosynthesis and pass it up the food chain. A few deep-sea vent ecosystems run on chemical energy instead (chemosynthesis).",
        """\b(?:percent(?:age)?|%|fraction|how much)\b.*\benergy\b.*\blost\b|\benergy\b.*\blost\b.*\btrophic\b""" to "About 90 percent, used for life processes or given off as heat. Only about 10 percent passes to the next trophic level.",
        """\beggshells?\b|\bpesticide\b.*\b(?:eagles?|birds?|falcons?|ospreys?)\b""" to "DDT. It biomagnified up the food chain and made the eggshells of bald eagles, peregrine falcons and ospreys too thin to survive, until Canada banned it in the 1970s.",
        """\b(?:top|apex) predators?\b.*\b(?:mercury|toxins?|pcbs?|ddt|pesticides?|chemicals?|pollutants?)\b|\b(?:mercury|toxins?|pcbs?|pollutants?)\b.*\b(?:top|apex) predators?\b""" to "Biomagnification: a persistent toxin like mercury is stored in the body and not broken down, and each predator eats many contaminated prey, so the concentration rises at every step up the food chain and is highest in top predators.",
        """\b(?:returns?|releases?|adds?|puts?|gives? off)\b.*\b(?:carbon dioxide|co2|co₂|carbon)\b.*\b(?:atmosphere|air)\b""" to "Cellular respiration by nearly every living thing, plus decomposition and combustion (burning fossil fuels and wood). Volcanoes add a little.",
        """\b(?:removes?|takes?|absorbs?)\b.*\b(?:carbon dioxide|co2|co₂|carbon)\b.*\b(?:atmosphere|air)\b""" to "Photosynthesis by plants, algae and phytoplankton. The oceans also dissolve carbon dioxide directly.",
        """\bbacteria\b.*\b(?:nitrogen gas|n2|atmospheric nitrogen|nitrogen from the air)\b.*\b(?:ammonia|usable|nitrates?)\b|\bwhat (?:bacteria|organisms?)\b.*\bfix(?:es)? nitrogen\b""" to "Nitrogen-fixing bacteria, such as Rhizobium in the root nodules of legumes, plus some free-living soil bacteria and cyanobacteria.",
        """\bbacteria\b.*\bammonia\b.*\bnitr(?:ates?|ites?)\b""" to "Nitrifying bacteria: Nitrosomonas turns ammonia into nitrites, then Nitrobacter turns nitrites into nitrates.",
        """\bbacteria\b.*\bnitrates?\b.*\bnitrogen gas\b""" to "Denitrifying bacteria, in waterlogged, low-oxygen soil.",
        """\bsalmon\b.*\b(?:forests?|trees|ecosystems?|important|bears?)\b""" to "Bears and eagles carry spawned-out salmon into the forest, and the bodies fertilize it with ocean nitrogen and other nutrients, so trees near salmon streams grow faster. Salmon are a keystone species and central to First Peoples' food and culture.",
        """\bcosewic\b""" to "The Committee on the Status of Endangered Wildlife in Canada, the expert panel that assesses which species are at risk. The government then lists them under the Species at Risk Act (SARA).",
        """\b(?:first|earliest)\b.*\b(?:organisms?|species|plants|life|to (?:arrive|grow|colonize))\b.*\bsuccession\b|\bsuccession\b.*\b(?:first|earliest)\b""" to "Pioneer species: lichens and mosses on bare rock in primary succession, or fast-growing grasses, weeds and fireweed on disturbed soil in secondary succession.",
        """\bj[- ]shaped?\b""" to "Exponential growth, while resources are unlimited.",
        """\bs[- ]shaped?\b""" to "Logistic growth, which levels off at the carrying capacity.",
        """\b(?:shape|curve|graph)\b.*\blogistic\b|\blogistic\b.*\b(?:shape|curve|graph)\b""" to "An S-shaped (sigmoid) curve: slow, then fast, then levelling off at the carrying capacity.",
        """\b(?:shape|curve|graph)\b.*\bexponential\b|\bexponential\b.*\b(?:shape|curve|graph)\b""" to "A J-shaped curve that climbs faster and faster.",
        """\b(?:exceeds?|overshoots?|goes (?:above|over|past)|above|beyond|passes)\b.*\bcarrying capacity\b""" to "It overshoots: food and other resources run short, so deaths rise and births fall, and the population declines (sometimes crashes) back below the carrying capacity, then often swings around it.",
        """\b(?:bees?|pollinators?|hummingbirds?)\b.*\b(?:flowers?|plants)\b.*\b(?:relationship|symbiosis|interaction)\b|\b(?:relationship|symbiosis|interaction)\b.*\b(?:bees?|pollinators?)\b.*\b(?:flowers?|plants)\b""" to "Mutualism: the bee gets nectar and pollen as food, and the flower gets pollinated.",
        """\bexamples? of commensalism\b""" to "Barnacles riding on a whale, an epiphyte such as a moss or fern growing on a tree branch, or a remora riding on a shark.",
        """\bexamples? of mutualism\b""" to "Bees and flowers, mycorrhizal fungi on tree roots, clownfish and sea anemones, or a lichen (a fungus and an alga living together).",
        """\bexamples? of parasitism\b""" to "Ticks or fleas on a deer, a tapeworm in a gut, or mistletoe on a tree.",
        """\bexamples? of predation\b""" to "A wolf hunting deer, an orca eating seals, or an owl catching mice. The lynx and the snowshoe hare are the classic predator and prey cycle.",
        """\b(?:four |4 |main )?(?:types|kinds|categories) of ecosystem services\b""" to "Provisioning (food, water, timber), regulating (climate, floods, water purification, pollination), supporting (nutrient cycling, soil formation) and cultural (recreation, spiritual and educational value).",
        """\b(?:main|biggest|greatest|leading|number one|top) (?:cause|threat|reason)s?\b.*\b(?:biodiversity|extinctions?|species)\b|\b(?:causes?|threats?) (?:of|to) (?:biodiversity|extinction)\b""" to "Habitat loss and change, followed by invasive species, pollution, human population growth and overharvesting (HIPPO), with climate change growing fast.",
        """\bconservation\b.*\bpreservation\b|\bpreservation\b.*\bconservation\b""" to "Conservation means managing and using a resource wisely so it lasts, such as logging a forest sustainably. Preservation means protecting nature from use altogether and leaving it untouched, such as an ecological reserve.",
    ).map { Regex(it.first) to it.second }

    /** Ideas and processes, matched as the whole term by Terms. */
    private val terms = listOf(
        """producers?""" to "An organism, such as a plant, alga or some bacteria, that makes its own food from sunlight by photosynthesis (an autotroph). Producers form the first trophic level of every food chain.",
        """consumers?""" to "An organism that cannot make its own food and gets energy by eating other organisms (a heterotroph): herbivores, carnivores and omnivores.",
        """primary consumers?""" to "A herbivore that eats producers (plants or algae), the second trophic level, like a deer, a rabbit or zooplankton.",
        """secondary consumers?""" to "An animal that eats primary consumers (herbivores), the third trophic level, like a fox that eats rabbits.",
        """tertiary consumers?""" to "An animal that eats secondary consumers, the fourth trophic level, often a top carnivore like an orca, an eagle or a wolf.",
        """quaternary consumers?""" to "An animal that eats tertiary consumers, a fifth trophic level found only in a few long food chains.",
        """herbivores?""" to "An animal that eats only plants or algae, a primary consumer.",
        """carnivores?""" to "An animal that eats other animals, a secondary or higher consumer.",
        """omnivores?""" to "An animal that eats both plants and animals, like a bear or a human.",
        """detritivores?""" to "An organism that eats dead matter (detritus), like earthworms, millipedes and woodlice, helping decomposers recycle nutrients.",
        """scavengers?""" to "An animal that feeds on the bodies of dead animals, like a vulture or a raven.",
        """trophic levels?""" to "An organism's feeding level, its position in a food chain: producers first, then primary, secondary and tertiary consumers. About 10 percent of the energy passes from one level to the next.",
        """food chains?""" to "A single path showing who eats whom and how energy moves from a producer through a series of consumers, like grass to rabbit to fox.",
        """food webs?""" to "All the interconnected food chains in an ecosystem, showing the many feeding links between organisms. It is more realistic, and a web with many links is more stable than a single chain.",
        """(?:energy|ecological) pyramids?|pyramids? of energy""" to "A diagram of the energy at each trophic level, widest at the producers and narrowing upward because only about 10 percent passes to the next level.",
        """pyramids? of numbers""" to "A diagram of how many organisms are at each trophic level. It can be upside down, as when many insects feed on one tree.",
        """pyramids? of biomass""" to "A diagram of the total mass of living matter at each trophic level.",
        """biomass""" to "The total mass of living (or recently living) matter in an area or at a trophic level.",
        """biomagnification|biological magnification""" to "The increase in concentration of a persistent toxin, such as mercury, DDT or PCBs, at each higher trophic level up the food chain, because each predator eats many contaminated prey. Top predators like orcas and eagles carry the most.",
        """bioaccumulation""" to "The build-up of a toxin, such as mercury or a pesticide, in an organism's tissues over its lifetime, because it takes the toxin in faster than it can break it down or get rid of it.",
        """(?:the )?carbon cycle""" to "The movement of carbon through living things, the air, oceans and rock. Photosynthesis takes carbon dioxide from the air; respiration, decomposition and combustion (burning fossil fuels) return it. Oceans, forests and rock store it.",
        """(?:the )?nitrogen cycle""" to "The movement of nitrogen between the air, soil and living things. Bacteria fix nitrogen gas into ammonia, other bacteria turn that into nitrates for plants (nitrification), animals eat the plants, decomposers return ammonia, and denitrifying bacteria release nitrogen gas back to the air.",
        """nitrogen fixation""" to "Turning nitrogen gas (N₂) from the air into ammonia or nitrates that plants can use. Bacteria in the soil and in the root nodules of legumes do it, and so does lightning.",
        """nitrification""" to "Soil bacteria turning ammonia into nitrites and then nitrates, the form most plants absorb.",
        """denitrification""" to "Bacteria in waterlogged, low-oxygen soil turning nitrates back into nitrogen gas (N₂), which returns to the atmosphere.",
        """ammonification""" to "Decomposers breaking down dead organisms and wastes and releasing their nitrogen as ammonia.",
        """(?:the )?phosphorus cycle""" to "The slow movement of phosphorus from rock into soil and water by weathering, into plants and animals, and back into sediment. It has no gas stage in the atmosphere. Runoff of phosphate fertilizer causes eutrophication.",
        """carbon sinks?""" to "Something that absorbs and stores more carbon than it releases, like the oceans, forests, soil and peat bogs.",
        """carbon sources?""" to "Something that releases more carbon than it absorbs, like burning fossil fuels, a volcano or a forest fire.",
        """biogeochemical cycles?|nutrient cycles?|matter cycles?""" to "The paths that matter such as carbon, nitrogen, phosphorus and water follows through living things and the air, water and rock. Matter is recycled, while energy flows through and is lost as heat.",
        """biodiversity|biological diversity""" to "The variety of life in an area, at three levels: genetic diversity, species diversity and ecosystem diversity. More diverse ecosystems are more stable.",
        """genetic diversity""" to "The variety of genes (genetic variation) within a species or population. It helps a species adapt to disease and change.",
        """species diversity""" to "The number of different species in an area (richness) and how evenly their numbers are spread (evenness).",
        """ecosystem diversity""" to "The variety of habitats and ecosystems in a region, such as forests, wetlands, grasslands and estuaries.",
        """species richness""" to "The number of different species in an area.",
        """keystone species""" to "A species that has a large effect on its ecosystem compared with its numbers; without it the ecosystem changes drastically or collapses. Sea otters are one: they eat the sea urchins that would otherwise wipe out kelp forests.",
        """indicator species""" to "A species whose presence, absence or health shows the condition of an environment, such as pollution or water quality, like lichens for air quality or frogs and mayfly larvae for water.",
        """endemic species""" to "A species found naturally in only one place in the world.",
        """native species""" to "A species that lives naturally in an area, without people bringing it there.",
        """introduced species|non-?native species|exotic species|alien species""" to "A species brought by people into an area where it did not live before.",
        """extirpated species|extirpation|extirpated""" to "A species no longer found in one area (in the wild in Canada, for example) but still alive elsewhere.",
        """threatened species""" to "A species likely to become endangered if nothing is done about the threats to it.",
        """species at risk""" to "In Canada, a species listed as extirpated, endangered, threatened or of special concern under the Species at Risk Act (SARA).",
        """(?:ecological )?succession""" to "The gradual change in the species of a community over time, from pioneer species to a stable climax community. Primary succession starts on bare rock; secondary succession starts after a disturbance that leaves the soil.",
        """primary succession""" to "Succession on bare rock or new land with no soil, such as after a lava flow or a retreating glacier. Pioneer species such as lichens and mosses arrive first and slowly build soil.",
        """secondary succession""" to "Succession after a disturbance such as a fire, flood or logging removes a community but leaves the soil, so grasses and shrubs regrow quickly, then trees. It is faster than primary succession.",
        """pioneer species""" to "The first species to colonize bare or disturbed land, such as lichens and mosses on rock or fireweed after a fire. They break down rock and build soil for those that follow.",
        """climax communit(?:y|ies)""" to "The stable, mature community at the final stage of succession, which lasts until a disturbance, like an old-growth forest.",
        """carrying capacity""" to "The maximum population of a species that an environment can support over the long term with its food, water, space and other resources.",
        """limiting factors?""" to "Anything that limits or restricts a population's growth, such as food, water, space, predators, disease or temperature.",
        """density[- ]dependent factors?""" to "A limiting factor whose effect grows as a population gets more crowded: competition, predation, disease and parasites.",
        """density[- ]independent factors?""" to "A limiting factor that affects a population the same way whatever its size: weather, fire, floods and drought.",
        """exponential growth""" to "Growth by a constant percentage, so the population doubles again and again, faster and faster, making a J-shaped curve. It happens while resources are unlimited.",
        """logistic growth""" to "Growth that is fast at first, then slows and levels off at the carrying capacity, making an S-shaped curve.",
        """r-?selected species|r-?strategists?|r-?selection""" to "A species that has many offspring, matures fast and gives little or no parental care, so few survive, like insects, mice and dandelions. It does well in unstable environments.",
        """k-?selected species|k-?strategists?|k-?selection""" to "A species that has few offspring, matures slowly and gives them a lot of parental care, with a population near the carrying capacity, like elephants, whales and humans.",
        """populations?""" to "All the members of one species living in the same area at the same time.",
        """(?:ecological )?communit(?:y|ies)""" to "All the populations of different species living and interacting together in the same area.",
        """habitats?""" to "The place where an organism lives and finds what it needs: its natural home or environment.",
        """(?:ecological )?niches?""" to "The role a species plays in its ecosystem: what it eats, where it lives and how it interacts with others, its whole way of life.",
        """predation""" to "One organism (the predator) hunting, killing and eating another (the prey).",
        """competition""" to "Organisms struggling for the same limited resources, like food, water, light or space, within a species or between species.",
        """symbiosis|symbiotic relationships?""" to "A close, long-term relationship between two species: mutualism, commensalism or parasitism.",
        """mutualism""" to "A symbiosis where both species benefit, like bees pollinating flowers or fungi living on tree roots (mycorrhizae).",
        """commensalism""" to "A symbiosis where one species benefits and the other is neither helped nor harmed, like barnacles riding on a whale.",
        """parasitism""" to "A symbiosis where one species (the parasite) benefits by living on or in another (the host) and harming it, like ticks on a deer.",
        """ecosystem services""" to "The benefits that ecosystems give humans for free: clean water and air, pollination of crops, food, timber, flood control, climate regulation, soil formation, and cultural and spiritual value.",
        """sustainability|sustainable development""" to "Meeting the needs of people today without compromising the ability of future generations to meet their own needs, keeping ecosystems and resources healthy for the long term.",
        """renewable resources?""" to "A natural resource that is replaced (replenished) naturally within a human lifetime, like sunlight, wind, water, and forests and fish if harvested sustainably.",
        """non-?renewable resources?""" to "A resource that takes millions of years to form, so its supply is finite and it can run out, like coal, oil, natural gas and minerals.",
        """habitat fragmentation""" to "Breaking a large habitat into smaller, isolated pieces, divided by roads, farms, logging or cities, which cuts populations apart.",
        """habitat loss|habitat destruction""" to "The destruction or change of a habitat so it can no longer support its species, the biggest cause of species loss.",
        """deforestation""" to "Clearing or cutting down forests for farming, logging or building without replanting. It destroys habitat and releases carbon.",
        """eutrophication""" to "Excess nutrients, mostly nitrogen and phosphorus from fertilizer runoff and sewage, make algae bloom in a lake; when the algae die, decomposers use up the oxygen in the water, and fish die.",
        """acid rain|acid precipitation|acid deposition""" to "Rain made acidic when sulfur dioxide and nitrogen oxides from burning fossil fuels, smelters and vehicles react with water in the air to form sulfuric and nitric acid. It harms lakes, forests and buildings.",
        """ocean acidification""" to "The ocean's pH dropping as it absorbs extra carbon dioxide (CO₂) from the air, forming carbonic acid that makes it harder for shellfish and coral to build their shells.",
        """overexploitation|overharvesting|overfishing""" to "Taking a resource, such as fish or trees, faster than it can replace itself, so its population crashes.",
        """traditional ecological knowledge|traditional knowledge|tek|indigenous knowledge""" to "The knowledge, practices and beliefs about the land and living things that Indigenous (First Peoples) communities have built up and passed down over many generations of living on and observing the land.",
        """ecological restoration|restoration ecology|habitat restoration""" to "Helping a damaged, degraded or destroyed ecosystem recover, by replanting native species, removing invasive species, or restoring streams and wetlands.",
        """conservation""" to "Protecting and managing natural resources and species so they are used wisely and last.",
        """protected areas?""" to "Land or water set aside to conserve nature, such as national and provincial parks, ecological reserves and marine protected areas.",
        """(?:environmental )?stewardship""" to "Taking responsibility for caring for and managing the environment so it stays healthy for future generations.",
        """(?:the )?precautionary principle""" to "When an action might cause serious harm to people or the environment, take caution and act to prevent it before the science is certain.",
        """ecological footprints?""" to "The area of land and water needed to supply the resources a person or population uses and absorb its wastes. The average Canadian's is about 8 hectares.",
        """(?:the )?tragedy of the commons""" to "When a shared resource that everyone can use, like a fishery or the air, is overused and ruined because each individual acts in their own interest. Garrett Hardin described it in 1968.",
        """watersheds?|drainage basins?""" to "An area of land where all the water drains to the same river, lake or ocean, like the Fraser River watershed.",
        """riparian (?:zones?|areas?)""" to "The strip of land and plants along a stream, river or lake. It filters runoff, shades the water and holds the banks together.",
        """wetlands?""" to "Land soaked with water for much of the year, such as marshes, swamps and bogs. Wetlands filter water, control floods and hold many species.",
        """estuar(?:y|ies)""" to "Where a river meets the sea and fresh water mixes with salt water, one of the most productive ecosystems, like the Fraser River estuary.",
        """(?:the )?biosphere""" to "All the parts of Earth where life exists: land, water and air.",
        """ecology""" to "The study of how organisms interact with each other and with their environment.",
        """abiotic(?: factors?)?""" to "A non-living part of an ecosystem, such as sunlight, temperature, water, soil, air and nutrients.",
        """biotic(?: factors?)?""" to "A living part of an ecosystem, such as plants, animals, fungi and bacteria, or their remains.",
        """decomposers?""" to "An organism, mostly bacteria and fungi, that breaks down dead organisms and wastes and recycles their nutrients back into the soil, water and air for producers to use again.",
        """legumes?""" to "Plants of the pea family, like peas, beans, clover, alfalfa and lupines, whose root nodules hold nitrogen-fixing bacteria, so they enrich the soil with nitrogen.",
        """old[- ]growth(?: forests?)?""" to "A forest that has grown for centuries without major disturbance, with huge old trees (some over 500 years in BC), standing dead snags and fallen logs: a climax community. Coastal BC old growth includes western red cedar and Douglas fir.",
        """interspecific competition""" to "Competition between different species for the same limited resource, like wolves and cougars hunting the same deer.",
        """intraspecific competition""" to "Competition among members of the same species for food, space or mates. It grows as the population gets more crowded.",
        """predator[- ]prey (?:relationships?|cycles?|interactions?)""" to "One species (the predator) hunts and eats the other (the prey), so their numbers rise and fall in linked cycles: more prey feeds more predators, which then eat the prey down, like the lynx and the snowshoe hare.",
        """provisioning (?:ecosystem )?services?""" to "The products people take from ecosystems: food, fresh water, timber, fibre, fuel and medicines.",
        """regulating (?:ecosystem )?services?""" to "The ways ecosystems keep conditions in check: climate regulation, flood control, water purification, pollination and pest control.",
        """supporting (?:ecosystem )?services?""" to "The basic processes the other services depend on: nutrient cycling, soil formation, photosynthesis and habitat.",
        """cultural (?:ecosystem )?services?""" to "The non-material benefits of nature: recreation, tourism, spiritual and cultural value, and education.",
        """clear-?cutting|clear-?cuts?""" to "Logging that cuts down all (or nearly all) the trees in an area at once. It is cheap but removes habitat, causes erosion and can silt up streams.",
        """selective (?:logging|cutting|harvesting)""" to "Logging that cuts only some trees, chosen by size, species or health, and leaves the rest of the forest standing.",
        """(?:the )?(?:mountain )?pine beetles?""" to "A native bark beetle, the size of a grain of rice, that kills pine trees by boring under the bark. Warm winters let it explode in BC from the late 1990s, killing over half the province's lodgepole pine.",
        """(?:the )?great bear rainforest""" to "A huge temperate rainforest on the central and north coast of British Columbia, about 6.4 million hectares, home to the white Spirit (Kermode) bear. Most of it was protected in 2016 in an agreement with First Nations.",
        """reforestation""" to "Planting trees (replanting) on land where a forest was cut or burned, to grow it back.",
        """afforestation""" to "Planting trees on land that has not been forest for a long time.",
        """ecosystems?""" to "All the living things (biotic factors) in an area interacting with each other and with their non-living environment (abiotic factors), such as a forest, a lake or an estuary.",
        """invasive species""" to "An introduced, non-native species that spreads quickly and harms its new ecosystem, often outcompeting native species because its natural predators and diseases were left behind.",
        """biomes?""" to "A large region of the world with a similar climate and similar plants and animals, such as tundra, boreal forest, temperate rainforest, grassland or desert.",
        """endangered species""" to "A species at risk of becoming extinct (or extirpated) soon if nothing changes.",
        """extinction""" to "The permanent loss of a species when its last member dies, so it no longer exists anywhere.",
        """(?:maximum )?sustainable yield""" to "The largest amount of a renewable resource, such as fish or timber, that can be harvested year after year without shrinking the population, because it is no more than what grows back.",
    ).map { Triple(Regex("^(?:" + it.first + ")$"), it.second, it.first) }

    private val kinds = listOf(
        """(?:type of |kind of )?succession""" to """succession""",
        """(?:type of |kind of )?(?:symbiotic )?(?:relationship|symbiosis|interaction)s?""" to """^(?:mutualism|commensalism|parasitism|predation|competition)$""",
        """(?:type of |kind of )?(?:organisms?|consumers?)""" to """producer|consumer|herbivore|carnivore|omnivore|detritivore|scavenger""",
        """(?:type of |kind of )?(?:population )?growth""" to """growth""",
        """(?:type of |kind of )?species""" to """species""",
        """(?:type of |kind of )?(?:nutrient )?cycles?""" to """cycle""",
    )

    /** Trophic level of each word: producers are level 0. */
    private val level = mapOf("producer" to 0, "producers" to 0, "first" to 0, "primary" to 1, "second" to 1, "secondary" to 2, "third" to 2, "tertiary" to 3, "fourth" to 3, "quaternary" to 4, "fifth" to 4)

    /** The trophic level of each kind of organism. */
    private val trophic = mapOf(
        "producer" to "The first trophic level: producers make their own food.",
        "plant" to "The first trophic level: plants are producers.",
        "herbivore" to "The second trophic level: herbivores are primary consumers that eat producers.",
        "carnivore" to "The third trophic level or higher: carnivores are secondary or tertiary consumers.",
        "omnivore" to "The second, third or higher trophic level, since omnivores eat both producers and consumers.",
        "decomposer" to "Decomposers feed on dead matter from every trophic level, so they sit outside the chain and recycle its nutrients.",
    )

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun p(v: Double, digits: Int) = pcNum(Precalc.sig(v, digits).toDouble())
    private fun num(s: String) = s.replace(",", "").toDouble()

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m = find("""\btrophic level\b.*\b(producer|plant|herbivore|carnivore|omnivore|decomposer)s?\b|\b(producer|plant|herbivore|carnivore|omnivore|decomposer)s?\b.*\btrophic level\b""", q)
        if (m != null) trophic[m[1].ifEmpty { m[2] }]?.let { return out(it) }
        Terms.answer(q.replace(Regex(""" in (?:ecology|an ecosystem|environmental science)$"""), ""), terms, kinds)?.let { return out(it) }
        // 10 percent rule: energy × 0.1 for each trophic level climbed
        val lv = Regex("""\b(producers?|first|primary|second|secondary|third|tertiary|fourth|quaternary|fifth)\b""").findAll(q).map { level.getValue(it.groupValues[1]) }.toList()
        m = find("""(\d[\d,]*(?:\.\d+)?)\s*(kj|j|kcal|calories|cal|units?)?\b""", q)
        if (lv.size >= 2 && has("""\b(?:consumers?|producers?|trophic)\b""", q) && has("""\bhow much\b|\bavailable\b|\breach""", q) && m != null) {
            val e = num(m[1])
            val n = lv.last() - lv.first()
            val u = if (m[2].isEmpty()) "" else " " + m[2].replace(Regex("^kj$"), "kJ").replace(Regex("^j$"), "J")
            if (n > 0) return out(p(e * 0.1.pow(n), 6) + u + ": about 10 percent of the energy passes up each trophic level, so " + pcNum(e) + " × 0.1" + (if (n > 1) "^$n" else "") + ".")
        }
        // population density = individuals ÷ area
        if (has("""\bdensity\b""", q)) {
            m = find("""(\d[\d,]*)\b.*?\b(\d+(?:\.\d+)?)\s*(square kilomet(?:re|er)s?|km2|km²|square met(?:re|er)s?|m2|m²|hectares?|ha|square miles?)\b""", q)
            if (m != null) {
                val n = num(m[1])
                val a = m[2].toDouble()
                return out(p(n / a, 6) + " per " + m[3].replace(Regex("s$"), "") + " (" + pcNum(n) + " ÷ " + pcNum(a) + ").")
            }
        }
        // mark and recapture (Lincoln-Petersen): population = marked × caught ÷ marked in the catch
        if (has("""\b(?:mark|tag|band)(?:ed|s|ing)?\b""", q) && has("""\b(?:recapture\w*|caught|captured|later|second)\b""", q) && has("""\b(?:estimate|population|how many)\b""", q)) {
            val n = Regex("""\d+(?:\.\d+)?""").findAll(q).map { it.value.toDouble() }.toList()
            if (n.size == 3 && n[2] > 0) return out("About " + pcNum((n[0] * n[1] / n[2]).roundToLong().toDouble()) + " (marked × caught ÷ marked recaptures = " + pcNum(n[0]) + " × " + pcNum(n[1]) + " ÷ " + pcNum(n[2]) + ").")
        }
        // growth rate from one population size to the next
        if (has("""\bgrowth rate\b|\brate of growth\b|\bpercent(?:age)? (?:growth|increase|change)\b""", q)) {
            m = find("""\bfrom (\d[\d,]*) to (\d[\d,]*)\b""", q)
            if (m != null) {
                val a = num(m[1])
                val b = num(m[2])
                val r = (b - a) / a
                val t = find("""\bin (\d+) years\b""", q)
                return out(p(r * 100, 6) + "% (" + p(r, 6) + ")" + (if (t != null && t[1].toInt() > 1) " over " + t[1] + " years" else "") + ": (" + pcNum(b) + " - " + pcNum(a) + ") ÷ " + pcNum(a) + ".")
            }
        }
        // doubling time of a population by the rule of 70
        if (has("""\bdoubl""", q) && has("""\bpopulation\b""", q)) {
            m = find("""(\d+(?:\.\d+)?)\s*(?:%|percent)""", q)
            if (m != null) return out("About " + p(70 / m[1].toDouble(), 4) + " years (rule of 70: 70 ÷ " + m[1] + ").")
        }
        return null
    }
}
