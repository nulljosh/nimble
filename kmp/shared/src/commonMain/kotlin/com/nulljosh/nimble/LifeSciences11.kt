package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.pow

/**
 * BC Life Sciences 11 with no network: characteristics of life, taxonomy, viruses, bacteria and archaea, protists,
 * fungi, plants, evolution and animal body plans as plain facts, plus microscope and bacterial growth arithmetic.
 * A port of `ls11()` and its tables in docs/engine.js (the tables are copied from there). Precalc.answer asks it
 * right after Science10.
 */
internal object LifeSciences11 {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\bcharacteristics of (?:all )?(?:living things|life|organisms)\b""" to "Living things are made of cells, use energy (metabolism), grow and develop, reproduce, respond to their environment, keep a stable internal state (homeostasis), and adapt over generations.",
        """\b(?:levels|ranks|order|hierarchy) of (?:classification|taxonomy)\b|\btaxonomic (?:levels|ranks|hierarchy)\b""" to "Domain, kingdom, phylum, class, order, family, genus, species, from broadest to most specific. A memory aid: Dear King Philip Came Over For Good Soup.",
        """\b(?:three |3 )?domains of life\b|\bthree domains\b""" to "Bacteria, Archaea and Eukarya.",
        """\b(?:six|6|the) kingdoms\b|\bkingdoms of life\b""" to "Animalia (animals), Plantae (plants), Fungi, Protista (protists), Archaebacteria (archaea) and Eubacteria (bacteria).",
        """\bwho (?:developed|invented|created|came up with) (?:binomial nomenclature|the classification system)\b|\bfather of taxonomy\b""" to "Carl Linnaeus, a Swedish botanist, in the 1750s.",
        """\b(?:levels|parts|ranks|names)\b[a-z ]*\b(?:scientific name|binomial name)\b|\bscientific name (?:is )?made (?:up )?of\b""" to "The genus and the species, as in Homo sapiens.",
        """\bviruse?s? made (?:up )?of\b|\bstructure of a virus\b|\bparts of a virus\b""" to "Genetic material (DNA or RNA) inside a protein coat called a capsid. Some also have a lipid envelope. No cytoplasm, ribosomes or metabolism.",
        """\b(?:are|is) (?:a )?virus(?:es)? (?:alive|living)\b""" to "No. Most biologists class viruses as non-living: they have no cells, no metabolism, and cannot reproduce outside a host cell.",
        """\blytic\b.*\blysogenic\b|\blysogenic\b.*\blytic\b""" to "In the lytic cycle a virus takes over the cell at once, makes copies and bursts (lyses) the cell. In the lysogenic cycle its DNA inserts into the host DNA as a prophage and lies dormant, copied with every cell division, until a trigger switches it to the lytic cycle.",
        """\bantibiotics?\b.*\bviru""" to "Antibiotics target parts of bacterial cells, such as the cell wall and ribosomes. Viruses have neither and are not living cells: they copy themselves inside host cells, so antibiotics cannot touch them. Vaccines and antivirals are used instead.",
        """\bhow (?:do|does) (?:bacteria|a bacterium|prokaryotes) reproduce\b""" to "Asexually, by binary fission: the cell copies its DNA and splits into two identical cells. Bacteria can also swap DNA by conjugation.",
        """\bshapes? of bacteri""" to "Cocci (spheres), bacilli (rods) and spirilla (spirals).",
        """\bconjugation (?:in|of|between) bacteri|\bbacterial conjugation\b""" to "Two bacteria join by a pilus and one passes a copy of DNA, usually a plasmid, to the other. It mixes genes but makes no new cells.",
        """\bprokaryot.*\beukaryot|\beukaryot.*\bprokaryot""" to "Eukaryotic cells have a nucleus and membrane-bound organelles. Prokaryotic cells (bacteria and archaea) have no nucleus, their DNA sits in the cytoplasm, and they are much smaller.",
        """\bbacteria\b.*\barchaea|\barchaea.*\bbacteria\b""" to "Both are prokaryotes. Bacterial cell walls contain peptidoglycan; archaea have none, have different membrane lipids, and many live in extreme places like hot springs and salt lakes.",
        """\bhow (?:do|does) (?:an? )?amoeba(?:s|e)? move\b""" to "With pseudopods, extensions of cytoplasm (\"false feet\") that also engulf food.",
        """\bhow (?:do|does) (?:a )?parameci(?:a|um|ums) move\b""" to "With cilia, short hairlike structures that beat together.",
        """\beuglena\b.*\b(?:energy|food|eat|nutrition|nutrients)\b""" to "Both ways: in light it photosynthesizes with chloroplasts (an autotroph), and in the dark it absorbs food from its surroundings (a heterotroph). It swims with a flagellum.",
        """\bcauses? malaria\b|\bmalaria (?:is )?caused by\b""" to "Plasmodium, a protist parasite spread by the bite of Anopheles mosquitoes.",
        """\bfung(?:al|i|us)\b.*\bcell walls?\b""" to "Chitin, the same tough material in insect exoskeletons.",
        """\bhow (?:do|does) fung(?:i|us) (?:get|obtain) (?:food|nutrients|energy|nutrition)\b|\bhow (?:do|does) fung(?:i|us) (?:eat|feed)\b""" to "They are heterotrophs that absorb nutrients: they release digestive enzymes onto food outside their bodies and absorb what breaks down, often as decomposers of dead matter.",
        """\bhow (?:do|does) fung(?:i|us) reproduce\b""" to "By spores, made asexually or sexually. Yeasts also reproduce by budding, and hyphae can grow from broken pieces.",
        """\bwhat does (?:the )?xylem (?:transport|carry|do|move)\b""" to "Water and dissolved minerals, up from the roots to the leaves.",
        """\bwhat does (?:the )?phloem (?:transport|carry|do|move)\b""" to "Sugars (food) made in the leaves, to the rest of the plant.",
        """\b(?:four|4|main|major) (?:main |major )?(?:groups|types) of plants\b|\bplant groups\b""" to "Mosses and other bryophytes (no vascular tissue, no seeds), ferns (vascular, spores), gymnosperms such as conifers (seeds in cones) and angiosperms (flowering plants, seeds in fruit).",
        """\bmonocots?\b.*\bdicots?\b|\bdicots?\b.*\bmonocots?\b""" to "Monocots have one cotyledon (seed leaf), parallel leaf veins, flower parts in threes and scattered vascular bundles, like grasses and lilies. Dicots have two cotyledons, net-like veins, flower parts in fours or fives and vascular bundles in a ring, like roses and oaks.",
        """\b(?:do|are) (?:mosses|bryophytes)\b.*\bvascular\b""" to "No. Mosses are non-vascular: they lack xylem and phloem, so they stay small and live in damp places.",
        """\bwho (?:proposed|came up with|developed|discovered)\b[a-z ]*\b(?:evolution|natural selection)\b|\bfather of evolution\b""" to "Charles Darwin, in On the Origin of Species (1859). Alfred Russel Wallace reached the same idea on his own.",
        """\bevidence (?:for|of) evolution\b""" to "Fossils, homologous and vestigial structures, similar embryos, DNA and protein similarities, where species live, and evolution seen directly, such as antibiotic-resistant bacteria.",
        """\bfitness (?:in (?:evolution|biology)|evolution)\b|^(?:biological|darwinian|evolutionary) fitness$""" to "An organism's ability to survive and reproduce in its environment, measured by how many offspring it leaves.",
        """\b(?:characteristics|traits|features) of (?:a )?mammals?\b""" to "Hair or fur, mammary glands that make milk, warm-blooded (endothermic), a four-chambered heart, three middle-ear bones, and most give live birth.",
        """\b(?:characteristics|traits|features) of (?:a )?birds?\b""" to "Feathers, a beak with no teeth, hollow bones, warm-blooded, a four-chambered heart, and hard-shelled eggs.",
        """\b(?:characteristics|traits|features) of (?:a )?reptiles?\b""" to "Dry scaly skin, lungs, cold-blooded (ectothermic), and leathery eggs laid on land (amniotic eggs).",
        """\b(?:characteristics|traits|features) of (?:an? )?amphibians?\b""" to "Moist skin with no scales, cold-blooded, eggs laid in water, and a life cycle that starts in water with gills and moves to land with lungs.",
        """\b(?:characteristics|traits|features) of (?:a )?fish(?:es)?\b""" to "Gills, fins, scales, cold-blooded, and they live in water.",
        """\bhow (?:is|are) (?:a )?scientific names? written\b|\brules? for (?:writing )?scientific names\b""" to "In italics (underlined when handwritten), genus first with a capital letter, then the species in lowercase: Homo sapiens.",
        """\b(?:smallest|most specific|narrowest|lowest) (?:unit|level|rank|group|category) (?:of|in) (?:classification|taxonomy)\b""" to "Species.",
        """\b(?:largest|broadest|biggest|highest) (?:unit|level|rank|group|category) (?:of|in) (?:classification|taxonomy)\b""" to "Domain.",
        """\bviruse?s? need to (?:reproduce|replicate|multiply)\b|\bhow (?:do|does) (?:a )?viruse?s? (?:reproduce|replicate|multiply)\b""" to "A host cell. A virus injects its genetic material and uses the host's ribosomes, enzymes and energy to copy itself, by the lytic or lysogenic cycle.",
        """\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a |an )?viruse?s?\b|\bviral (?:diseases?|infections?)\b""" to "Influenza (the flu), the common cold, COVID-19, measles, chickenpox, HIV/AIDS and rabies.",
        """\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a )?bacteri(?:a|um)\b|\bbacterial (?:diseases?|infections?)\b""" to "Strep throat, tuberculosis, cholera, tetanus, Lyme disease, salmonella food poisoning and bacterial pneumonia.",
        """\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a )?protists?\b""" to "Malaria (Plasmodium), sleeping sickness (Trypanosoma), giardiasis (Giardia) and amoebic dysentery.",
        """\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a )?fung(?:i|us)\b|\bfungal (?:diseases?|infections?)\b""" to "Athlete's foot, ringworm, yeast infections (Candida) and Dutch elm disease in trees.",
        """\bfunctions? of (?:the |a )?roots?\b|\bwhat do roots do\b""" to "Roots anchor the plant, absorb water and minerals from the soil, and often store food.",
        """\bfunctions? of (?:the |a )?stems?\b|\bwhat do stems do\b""" to "Stems hold the plant up and carry water (xylem) and food (phloem) between the roots and leaves.",
        """\bfunctions? of (?:the |a )?leaf\b|\bfunctions? of (?:the )?leaves\b|\bwhat do leaves do\b""" to "Leaves make food by photosynthesis and exchange gases through their stomata.",
        """\bfunctions? of (?:the |a )?flowers?\b|\bwhat do flowers do\b""" to "Flowers are for sexual reproduction: they attract pollinators, make pollen and eggs, and become fruit with seeds.",
    ).map { Regex(it.first) to it.second }

    /** Single terms, matched as the whole question. */
    private val defs = listOf(
        """binomial nomenclature""" to "A two-part scientific name: the genus (capitalized) then the species (lowercase), written in italics, such as Homo sapiens. Carl Linnaeus introduced it.",
        """taxonomy""" to "The science of naming, describing and classifying organisms into groups.",
        """(?:a )?dichotomous key""" to "A tool for identifying an organism through a series of steps, each offering two choices (a pair of opposite statements), until one name is left.",
        """cladograms?""" to "A branching diagram that shows evolutionary relationships: groups that share a more recent common ancestor sit on closer branches, and each branch point marks a shared derived trait.",
        """phylogenetic trees?|phylogeny""" to "A branching diagram of evolutionary relationships among species, tracing them back to common ancestors, often drawn against time.",
        """viruse?s?""" to "A tiny non-living particle of DNA or RNA in a protein coat (capsid) that can only reproduce inside a host cell.",
        """capsids?""" to "The protein coat (shell) that surrounds a virus's DNA or RNA.",
        """lytic cycle""" to "The virus attaches, injects its genetic material, takes over the cell to make new viruses, then bursts (lyses) the cell to release them, killing it.",
        """lysogenic cycle""" to "The virus's DNA inserts into the host cell's DNA as a prophage and lies dormant, copied each time the cell divides. A trigger such as stress can switch it to the lytic cycle.",
        """(?:bacterio)?phages?""" to "A virus that infects bacteria.",
        """prophages?""" to "Viral DNA inserted into a bacterium's DNA during the lysogenic cycle.",
        """vaccines?""" to "A weakened, killed or partial form of a pathogen (or instructions to make one of its proteins) that trains the immune system to recognize it, so a later infection is fought off quickly.",
        """binary fission""" to "Asexual reproduction in which a prokaryote copies its single circular chromosome and divides into two identical cells.",
        """cocc(?:i|us)""" to "Spherical (round) bacteria. In clusters they are staphylococci, in chains streptococci.",
        """bacill(?:i|us)""" to "Rod-shaped bacteria.",
        """spirill(?:a|um)""" to "Spiral-shaped bacteria.",
        """plasmids?""" to "A small ring (circular loop) of DNA separate from the main chromosome in bacteria. Plasmids often carry genes such as antibiotic resistance and can be passed between cells.",
        """endospores?""" to "A tough, dormant structure some bacteria form around their DNA to survive harsh conditions like heat, drying or chemicals, then grow again when conditions improve.",
        """prokaryotes?""" to "A single-celled organism with no nucleus or membrane-bound organelles: bacteria and archaea.",
        """eukaryotes?""" to "An organism whose cells have a nucleus and membrane-bound organelles: protists, fungi, plants and animals.",
        """archaea|archaebacteria""" to "Prokaryotes with no peptidoglycan in their cell walls and unusual membranes, many living in extreme environments (extremophiles) such as hot springs and salt lakes.",
        """protists?|protista""" to "Eukaryotes that are not plants, animals or fungi, mostly single-celled: animal-like (amoebas, paramecia), plant-like (algae, euglena) and fungus-like (slime molds).",
        """pseudopod(?:s|ia|ium)?""" to "A temporary extension of cytoplasm, a \"false foot\", that amoebas use to move and engulf food.",
        """cilia|cilium""" to "Short hairlike structures that beat to move a cell or move fluid past it.",
        """flagell(?:a|um)""" to "A long whiplike tail that spins or lashes to move a cell.",
        """hyph(?:ae|a)""" to "The long, thin threads (filaments) that make up the body of a fungus.",
        """mycelium|mycelia""" to "A network of hyphae, the main body of a fungus, usually hidden in soil or wood.",
        """lichens?""" to "A partnership (mutualism) between a fungus and an alga or cyanobacterium: the alga makes food by photosynthesis and the fungus gives shelter and water.",
        """decomposers?""" to "An organism, such as a fungus or bacterium, that breaks down dead matter and waste and returns nutrients to the soil.",
        """autotrophs?""" to "An organism that makes its own food, usually by photosynthesis, like plants and algae.",
        """heterotrophs?""" to "An organism that gets its food by eating or absorbing other organisms, like animals and fungi.",
        """alternation of generations""" to "A plant life cycle that switches between a haploid gametophyte, which makes gametes, and a diploid sporophyte, which makes spores.",
        """sporophytes?""" to "The diploid (2n) stage of a plant's life cycle that makes spores by meiosis. It is the main plant in ferns and seed plants.",
        """gametophytes?""" to "The haploid (n) stage of a plant's life cycle that makes gametes (eggs and sperm). It is the main plant in mosses.",
        """xylem""" to "Plant tissue that carries water and dissolved minerals up from the roots to the leaves.",
        """phloem""" to "Plant tissue that carries sugars (food) made in the leaves to the rest of the plant.",
        """gymnosperms?""" to "A seed plant whose seeds are not enclosed in fruit (\"naked seeds\"), usually borne on cones, like pines, firs and cedars.",
        """angiosperms?""" to "A flowering plant: its seeds form inside an ovary that becomes a fruit.",
        """stomat(?:a|e)|stomas?""" to "Tiny pores (openings) on a leaf, mostly underneath, opened and closed by guard cells to let carbon dioxide in and oxygen and water vapour out.",
        """vascular plants?""" to "A plant with vascular tissue, xylem for water and phloem for food, so it can grow tall: ferns, gymnosperms and angiosperms.",
        """bryophytes?""" to "A non-vascular plant such as a moss, liverwort or hornwort, which reproduces by spores and needs water for fertilization.",
        """pollination""" to "The transfer of pollen from the male part of a flower (anther) to the female part (stigma), by wind, insects, birds or other animals.",
        """genetic drift""" to "Random changes in allele frequencies from one generation to the next, by chance alone. Its effect is strongest in small populations.",
        """gene flow""" to "The movement of alleles between populations when individuals migrate and breed. It makes populations more alike.",
        """(?:the )?bottleneck effect""" to "Genetic drift after a disaster or event sharply reduces a population's size: the few survivors carry only some of the original alleles, so genetic variation drops.",
        """(?:the )?founder effect""" to "Genetic drift when a small group leaves to start a new population in a new area: its allele frequencies reflect the few founders, not the original population.",
        """speciation""" to "The formation of new species, usually when populations are separated (by geography or behaviour) and can no longer interbreed.",
        """allopatric speciation""" to "Speciation after a population is split by a physical barrier such as a river or mountain range.",
        """sympatric speciation""" to "Speciation without a physical barrier, for example through behaviour or a change in chromosome number.",
        """homologous structures?""" to "A body part shared by different species because they inherited it from a common ancestor. The structure is similar but the function may differ, like a human arm, a bat wing and a whale flipper.",
        """analogous structures?""" to "A body part with a similar function in species that did not get it from a common ancestor; it evolved separately, like bird wings and insect wings.",
        """vestigial structures?|vestigial organs?""" to "A body part that is reduced and has little or no function now but was useful in ancestors, like the human tailbone or whale hip bones.",
        """convergent evolution""" to "Unrelated species evolve similar traits independently because they live in similar environments, like sharks and dolphins.",
        """divergent evolution""" to "Related species become more different over time as they adapt to different environments.",
        """adaptive radiation""" to "One ancestral species rapidly diversifies into many new species, each adapted to a different niche, like Darwin's finches on the Galapagos.",
        """coevolution""" to "Two species evolve in response to each other, like flowers and their pollinators.",
        """(?:an )?adaptation""" to "An inherited trait that helps an organism survive and reproduce in its environment.",
        """radial symmetry""" to "Body parts arranged around a central point or axis, like a sea star or jellyfish: any cut through the centre gives similar halves.",
        """bilateral symmetry""" to "A body with left and right sides that are mirror images; only one cut down the middle gives two matching halves. Most animals, including humans.",
        """asymmetry|asymmetrical""" to "No symmetry at all, like most sponges.",
        """invertebrates?""" to "An animal without a backbone (spine), like insects, worms, molluscs and sea stars. About 95 percent of animal species.",
        """vertebrates?""" to "An animal with a backbone: fish, amphibians, reptiles, birds and mammals.",
        """species""" to "A group of organisms that can interbreed in nature and produce fertile offspring.",
        """retroviruse?s?""" to "An RNA virus, such as HIV, that uses the enzyme reverse transcriptase to copy its RNA into DNA, which then inserts into the host's DNA.",
        """pathogens?""" to "Anything that causes disease, such as a virus, bacterium, protist or fungus.",
        """pil(?:i|us)""" to "A short hairlike thread on a bacterium's surface, used to attach to surfaces or to another cell during conjugation.",
        """peptidoglycan""" to "The sugar and protein mesh that makes up bacterial cell walls. Archaea lack it, and penicillin attacks it.",
        """extremophiles?""" to "An organism that lives in extreme conditions, such as heat, salt, acid or cold, like many archaea.",
        """slime (?:molds?|moulds?)""" to "Fungus-like protists that live on decaying matter and, when food runs short, gather into a mass that makes spores.",
        """yeasts?""" to "A single-celled fungus that reproduces by budding. It ferments sugar into alcohol and carbon dioxide, which raises bread.",
        """budding""" to "Asexual reproduction in which a new organism grows as an outgrowth (bud) from the parent and breaks off, as in yeast and hydra.",
        """spores?""" to "A single reproductive cell that can grow into a new organism without fertilization. Fungi, ferns and mosses make them.",
        """cotyledons?""" to "A seed leaf: the first leaf or leaves of a plant embryo, often storing food. Monocots have one, dicots two.",
        """algae|alga""" to "Simple plant-like protists (and the cyanobacteria) that photosynthesize, from single cells to giant kelp. They have no true roots, stems or leaves.",
        """seeds?""" to "A plant embryo with a food supply inside a protective coat, made by gymnosperms and angiosperms.",
        """(?:cellular )?respiration""" to "Cells break down glucose with oxygen to release energy (ATP), giving off carbon dioxide and water: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O. It happens in mitochondria.",
        """transpiration""" to "Water moving up through a plant and evaporating from its leaves as water vapour, mostly through the stomata.",
        """conifers?""" to "A cone-bearing gymnosperm, usually an evergreen tree with needles, like pine, fir, spruce and cedar.",
        """ferns?""" to "A seedless vascular plant that reproduces by spores, found on the undersides of its fronds.",
        """fossils?""" to "The preserved remains or traces (such as bones, shells, footprints or imprints) of organisms from the distant past, usually in rock.",
        """artificial selection|selective breeding""" to "Humans choose which plants or animals breed, to bring out traits they want, as in dog breeds and crops.",
        """(?:an? )?(?:ecological )?niche""" to "An organism's role in its ecosystem: what it eats, where it lives, and how it interacts with other species.",
        """reproductive isolation""" to "Barriers that stop two populations from interbreeding, such as different mating seasons, behaviours or body parts, or sterile offspring. It leads to speciation.",
        """punctuated equilibrium""" to "The idea that species stay much the same for long periods, then change rapidly in short bursts, often after an environmental change.",
        """gradualism""" to "The idea that species change slowly and steadily through many small changes over long periods.",
        """(?:a )?coelom""" to "A fluid-filled body cavity lined with tissue from the mesoderm that holds the organs. Animals with one are coelomates.",
        """germ layers?""" to "The three tissue layers of an early animal embryo: ectoderm (skin and nerves), mesoderm (muscle, bone, blood) and endoderm (gut lining).",
    ).map { Regex("""^(?:what (?:is|are) |define |definition of )?(?:an? |the )?(?:""" + it.first + ")$") to it.second }

    /** Common name to genus and species. */
    private val names = mapOf(
        "human" to "Homo sapiens",
        "people" to "Homo sapiens",
        "dog" to "Canis familiaris (also written Canis lupus familiaris)",
        "cat" to "Felis catus",
        "house cat" to "Felis catus",
        "wolf" to "Canis lupus",
        "gray wolf" to "Canis lupus",
        "grey wolf" to "Canis lupus",
        "lion" to "Panthera leo",
        "tiger" to "Panthera tigris",
        "house mouse" to "Mus musculus",
        "mouse" to "Mus musculus",
        "fruit fly" to "Drosophila melanogaster",
        "e coli" to "Escherichia coli",
        "corn" to "Zea mays",
        "rice" to "Oryza sativa",
        "chimpanzee" to "Pan troglodytes",
        "horse" to "Equus caballus",
        "cow" to "Bos taurus",
        "honey bee" to "Apis mellifera",
        "honeybee" to "Apis mellifera",
        "grizzly bear" to "Ursus arctos horribilis",
        "brown bear" to "Ursus arctos",
        "black bear" to "Ursus americanus",
        "bald eagle" to "Haliaeetus leucocephalus",
        "orca" to "Orcinus orca",
        "killer whale" to "Orcinus orca",
        "western red cedar" to "Thuja plicata",
        "douglas fir" to "Pseudotsuga menziesii",
        "sockeye salmon" to "Oncorhynchus nerka",
        "chicken" to "Gallus gallus domesticus",
    )

    /** Kingdom and phylum of common organisms (phylum empty outside animals). */
    private val groups = listOf(
        Triple("""mushrooms?|yeasts?|molds?|moulds?|fung(?:i|us)""", "Fungi", ""),
        Triple("""trees?|flowers?|grass(?:es)?|moss(?:es)?|ferns?|plants?|algae""", "Plantae (algae are usually placed with the protists)", ""),
        Triple("""amoebas?|amoebae|parameci(?:a|um)|euglenas?|protists?|slime molds?|diatoms?""", "Protista", ""),
        Triple("""e\.? coli|bacteri(?:a|um)|streptococcus|salmonella""", "Eubacteria (domain Bacteria)", ""),
        Triple("""insects?|spiders?|crabs?|lobsters?|shrimps?|centipedes?|millipedes?|ants?|bees?|butterfl(?:y|ies)|beetles?""", "Animalia", "Arthropoda"),
        Triple("""snails?|slugs?|clams?|oysters?|mussels?|octop(?:us|i|uses)|squids?""", "Animalia", "Mollusca"),
        Triple("""earthworms?|leeches?|segmented worms?""", "Animalia", "Annelida"),
        Triple("""flatworms?|tapeworms?|planarians?""", "Animalia", "Platyhelminthes"),
        Triple("""roundworms?|nematodes?""", "Animalia", "Nematoda"),
        Triple("""sea stars?|starfish|sea urchins?|sand dollars?""", "Animalia", "Echinodermata"),
        Triple("""jellyfish|corals?|sea anemones?|hydras?""", "Animalia", "Cnidaria"),
        Triple("""sponges?""", "Animalia", "Porifera"),
        Triple("""humans?|people|dogs?|cats?|fish(?:es)?|birds?|frogs?|snakes?|mammals?|reptiles?|amphibians?|vertebrates?|whales?|sharks?|salmon""", "Animalia", "Chordata"),
    ).map { Triple(Regex("""^(?:the |an? )?(?:""" + it.first + ")$"), it.second, it.third) }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun micro(u: String) = u.replace(Regex("^u"), "µ")

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        for ((re, body) in defs) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        m = find("""\b(scientific name|binomial name|genus|species name) (?:of|for) (?:an? |the )?(?:domestic |common )?([a-z. ]+?)s?$""", q)
        if (m != null) names[m[2].replace(".", "")]?.let { n -> return out(if (m[1] == "genus") n.split(" ")[0] + " (" + n.replace(Regex(" \\(.*"), "") + ")." else "$n.") }
        // what kingdom do mushrooms belong to, what phylum are insects in
        m = find("""\b(kingdom|phylum)\b (?:do|does|is|are) (?:an? |the )?([a-z. ]+?) (?:belong to|in|part of|classified (?:in|as|under))$""", q)
            ?: find("""^(kingdom|phylum) (?:of|for) (?:an? |the )?([a-z. ]+)$""", q)
        if (m != null) {
            val rank = m[1]
            val name = m[2]
            groups.firstOrNull { it.first.containsMatchIn(name) }?.let { (_, k, p) ->
                return out(if (rank == "kingdom" || p.isEmpty()) (if (rank == "phylum") "Kingdom $k." else "$k.") else "$p (kingdom Animalia).")
            }
        }
        // microscopes: total magnification is eyepiece times objective
        if (has("""\bmagnification\b""", q)) {
            m = find("""(\d+(?:\.\d+)?)\s*[x×]\b.*?(\d+(?:\.\d+)?)\s*[x×]\b""", q)
            if (m != null) return out(pcNum(m[1].toDouble() * m[2].toDouble()) + "× (" + m[1] + "× eyepiece times " + m[2] + "× objective)")
        }
        // field of view shrinks as magnification grows: fov2 = fov1 * mag1 / mag2
        if (has("""\bfield of view\b""", q)) {
            m = find("""(\d+(?:\.\d+)?)\s*(mm|µm|um|μm)\b(?: at| under| with)? (?:a |the )?(\d+)\s*[x×]""", q)
            if (m != null) {
                val known = m
                val other = Regex("""(\d+)\s*[x×]""").findAll(q).map { it.groupValues[1] }.firstOrNull { it != known[3] }
                if (other != null) return out(pcNum(known[1].toDouble() * known[3].toDouble() / other.toDouble()) + " " + micro(known[2]) + " (field of view × magnification stays the same)")
            }
        }
        // actual size = image size / magnification
        if (has("""\bactual (?:size|length)\b""", q)) {
            m = find("""(\d+(?:\.\d+)?)\s*(mm|µm|um|μm|cm)\b.*?(\d+(?:\.\d+)?)\s*[x×]""", q)
            if (m != null) return out(pcNum(m[1].toDouble() / m[3].toDouble()) + " " + micro(m[2]) + " (image size ÷ magnification)")
        }
        // bacterial growth by doubling: N = N0 · 2^(t/d)
        if (has("""\bbacteri""", q)) {
            m = find("""\b(?:divides?|doubles?|splits?) every (\d+(?:\.\d+)?) (minute|hour|min|hr)s?\b""", q)
            val t = find("""\bafter (\d+(?:\.\d+)?) (minute|hour|min|hr)s?\b""", q)
            if (m != null && t != null) {
                fun unit(u: String) = if (u.startsWith("h")) 60.0 else 1.0
                val n = t[1].toDouble() * unit(t[2]) / (m[1].toDouble() * unit(m[2]))
                val start = find("""\bstarting (?:with|from) (\d+)\b""", q)?.get(1)?.toInt() ?: 1
                if (n == kotlin.math.floor(n)) {
                    val k = n.toInt()
                    return out(pcNum(start * 2.0.pow(n)) + " bacteria (" + k + " doublings: " + start + " × 2^" + k + ")")
                }
            }
        }
        return null
    }
}
