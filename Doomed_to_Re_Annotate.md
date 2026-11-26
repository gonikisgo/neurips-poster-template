<!-- Markdown conversion of "Doomed to Re-Annotate, Forever: The ImageNet Story" (33-page PDF). Images are omitted; figure captions and any text embedded in figures are kept (marked '[Text inside figure]'). Table cells written as 'X+d' / 'X-d' are a value followed by its delta. 'n=' gives the number of images in a subset. -->

**Doomed to Re-Annotate, Forever: The ImageNet Story** 

**Illia Volkov**\*, **Nikita Kisel**\*, **Tetiana Mishkina**, **Klara Janouskova**†, **Jiri Matas**  
Visual Recognition Group, Faculty of Electrical Engineering, Czech Technical University in Prague  
`{volkoill, kiselnik, mishktet, janoukl1, matas}@fel.cvut.cz`  
\* Equal contribution. † Corresponding author.

# **Abstract** 

Top-1 accuracy on ImageNet-1k remains the most commonly reported metric in visual recognition. Quality issues with the dataset have been repeatedly reported, yet the original 2012 noisy labels are still predominantly used. 

The paper presents a comprehensive effort, which goes well beyond prior correction attempts, toward obtaining accurate and complete ImageNet-1k validation set annotations. The result, **ReImageNet** , includes multilabel correction, object localization, revised class definitions, and semantic attributes ( _text-recognition_ , _rendition_ , _reflection_ , _crowd_ , _dominant_ ). The reannotation reveals that _≈12% of the original ImageNet-1k labels are incorrect_ , 31.9% of images are multilabel and 4.0% contain no object from an ImageNet-1k class. With the new labels, top-1 accuracy increases by 0.2–1.3% for supervised models and by 5–6% for MLLMs. We argue that annotation at ImageNet scale cannot realistically be completed in one pass, as errors and definitional issues are discovered only through annotating, and we build our pipeline around repeated refinement and error checking. We observed that human and LLM collaboration with appropriate tooling represents the current quality ceiling for annotation at this scale. ImageNet-1k issues propagate into its derivative test sets, indicating that the problem is structural rather than specific to any single benchmark. All annotations, class definitions, guidelines, and analysis code have been publicly released. Annotations, Code, Preview tool. 

# **1 Introduction** 

Top-1 accuracy on the ImageNet-1k [39] validation set remains the single most universally reported metric [54] in visual recognition, even in the era of foundation models and web-scale pretraining. ImageNet-1k results appear in virtually every recent vision architecture paper [12, 44, 41, 24, 8, 55, 53, 26, 43] and serve as a core indicator of progress in the field. 

Yet ImageNet-1k is far from clean: a growing body of work has documented label errors [33], omissions of multiple labels [2, 40, 45], class overlaps [48], and deeper structural problems, including a distribution shift between training and validation sets [18]. These issues have consequences: label noise introduces ranking instability affecting which models are selected for downstream use. Prior validation set reannotation efforts [2, 40, 45] made progress, but followed the original, problematic class taxonomy [18]. As a result, the corrected labels from different papers are inconsistent [18]. These efforts also came before the availability of powerful Multimodal Large Language Models (MLLMs), which make exhaustive multilabel annotation more manageable at this scale [19, 56]. 

In the paper, we describe a large-scale effort to obtain accurate, complete, and, wherever possible, backward-compatible ImageNet-1k validation set annotations. Toward this end, we go well beyond the prior art. We train in-house annotators and provide them classes in semantically coherent groups derived from the WordNet [29] hierarchy, reducing the cognitive burden of discriminating among 1,000 classes simultaneously. Work on each group starts with a familiarization pass: annotators study 

40th Conference on Neural Information Processing Systems (NeurIPS 2026). Track on Evaluations and Datasets. 

(b) ImGT: barbershop ReGT: barbershop; television; typewriter keyboard; vase wall clock; digital clock 

(a) ImGT: computer mouse ReGT: computer mouse; space bar; desk; sweatshirt / hoodie; computer keyboard; cellular telephone; T-shirt; window shade 

(c) ImGT: pier 

(d) ImGT: Saharan horned viper 

ReGT: suspension bridge; cliff 

ReGT: sidewinder 

Figure 1: ImGT – original single-label annotations (left) and ReGT – new multilabel localized reannotations (right). For both (a) and (b), ImGT is correct but incomplete – ReGT labels at least all objects a person notices within 5 seconds. In (b), `television` is a _reflection_ visible in the mirror (see Fig. 2). Image (c) shows an obvious labeling error. Image (d) needed a fine-grained correction: the two snake species are visually near-identical to non-experts due to convergent evolution; the ReGT was confirmed via reverse image search, tracing the photograph to a Utah-based wildlife biologist. 

the images and revise class definitions and names where needed. Then they proceed to per-image labeling, which is supported by a detector, Vision-Language Model (VLM), and MLLM predictions. Annotators label the objects that stand out on first viewing, not every object they can find. Our initial protocol asked for the latter, but objects spanning only a few dozen pixels, recognizable only from context and after zooming in, made the label set depend on how hard each annotator chose to look. 

Continuous quality checks and active communication with and among annotators were uncovering edge cases throughout the process, requiring repeated mid-annotation revisions of the guidelines and class definitions. This resulted in the introduction of attributes: _rendition_ , _reflection_ , and _textrecognition_ to consistently handle recurring questions like “is a toy gun a toy (or a gun)?” and “is an image of a face in a mirror a face?” (see Fig. 2). Attributes _crowd_ and _dominant_ were introduced to reduce the load in images with many objects of the same or different classes, respectively. 

Many images in ImageNet-1k depict multiple instances from several classes. For each image, we aim to provide bounding boxes for at least each immediately visible instance. Multilabel evaluation, however, is permissive: an image with several valid labels is counted correct for any of them, so accuracy on ReGT is not directly comparable to the single-label numbers reported over the past decade. We therefore also evaluate on expanded object crops, each containing exactly one annotated object, which recovers a strict single-label protocol on localized annotations (see Sec. 5.2). 

**Limitations.** Several sources of bias are inherent to our pipeline: annotators share a European background and are non-experts in fine-grained domains, model predictions may nudge labeling decisions, the effort covers only the validation set, and the images themselves date from 2012 and may no longer represent current instances of some classes. These are discussed in detail in Sec. 4.4. 

The challenges we document are not unique to ImageNet-1k but represent typical failure modes of large-scale visual benchmarks constructed under time and budget pressure. In Sec. 5.3, we show that annotation errors in ImageNet-1k propagate directly into its derivative test sets [15, 14, 49, 38, 1, 52]. 

**The contributions of the paper are: (i)** ReImageNet, a reannotated ImageNet-1k validation set with multilabel corrections, localized bounding boxes, revised class definitions, and rich semantic 

attributes enabling counting and detection evaluation; **(ii)** an evaluation of model performance on the corrected labels, label count analysis, and crop-based object-centric evaluation protocols; **(iii)** analysis of annotation error propagation to derivative ImageNet-1k benchmarks; and **(iv)** a characterization of the challenges facing large-scale visual benchmark construction that extends beyond ImageNet-1k, with practical guidance on the iterative high-quality annotation and human-MLLM collaboration. 

# **2 Related Work** 

**Label Quality of ImageNet.** ImageNet-1k has been a key benchmark in computer vision, but continued community review has uncovered problems that reduce its reliability. Several reannotation efforts have improved the label quality, mainly in the validation set: [40] carried out focused relabeling with multi-label handling; [45] used multiple annotators per image on a selected subset; [2] expanded this to the full validation set and introduced the ReaL accuracy metric; [33] estimated label error rates across popular benchmarks. Automatic relabeling of the training set has also been explored [2, 59]. 

Later work shifted to deeper structural problems: [48] studied class overlap and duplicate images; [18] identified a distribution shift between training and validation sets, class name mismatches with actual image content, near-synonym classes, and subclass–superclass overlaps. Building on this, we carried out a partial reannotation that produced measurable changes in model rankings [19]. In this work, we annotate the full validation set from scratch, unifying multilabel correction, localization, revised class definitions, and structured attribute annotation in a single effort. 

**Derivative Benchmarks and Robustness Evaluation.** Many benchmarks build on ImageNet1k [31, 13, 25, 38, 15, 14, 49, 1, 52, 16], inheriting either its images and labels or its taxonomy, resulting in its problems propagating to them (see Sec. 5.3). The first group reuses the original images and directly inherits the annotation noise ( _e.g._ Hard ImageNet [31], ImageNet-C/-P [13], ImageNet-LT [25]). The second adopts the ImageNet-1k taxonomy on newly collected images. ImageNetV2 [38] closely mirrors the original collection process, so structural issues carry over at a similar rate. Others target specific robustness aspects (ImageNet-A [15], ImageNet-R [14], ImageNet-Sketch [49], ObjectNet [1], CounterAnimal [52]). ImageNet-X [16] adds structured attribute annotations; our reannotation extends this idea by combining attribute annotation with multilabel correction and localization. None of these efforts re-examines the inherited label structure. 

**Large-Scale Annotation Methodology.** Crowdsourcing platforms such as Amazon Mechanical Turk (AMT) and Prolific are the standard infrastructure for large-scale vision benchmarks [6, 22, 20], but they have structural limitations for fine-grained semantic annotation. Guidelines must be fully specified before annotation begins and cannot easily be updated when edge cases arise. Collecting multiple labels per image and resolving disagreements by majority vote reduces random errors but does not fix systematic annotator biases and introduces non-transparent design choices [21]. On fine-grained categories, one expert label beats the average of ten crowd labels [47]. Frameworks such as Mephisto [46] improve reproducibility but do not address this core problem. 

**LLMs as Annotators.** Whether LLMs can replace or augment human annotators has been actively studied in NLP, where [11] showed that ChatGPT surpasses crowdworkers on several text classification tasks. In computer vision, prior LLM-based annotation work has focused on image captioning, with quality verified through manual checks [42] or downstream performance [4], yet a gap with human annotators remains even for modern LLMs [34]. [19] provided a case study, showing that GPT-4o [36] predictions frequently agreed with or improved upon trained human annotations. The complementary strengths of each motivate the combined human–LLM strategy we adopt. 

# **3 ImageNet-1k Annotation: From Classification to Multilabel Localization** 

Image classification is canonically defined as assigning a single label from a fixed set of categories to an image. In practice, however, this single-label assumption is frequently violated: an image may contain multiple objects, or a single object may admit several valid labels.<sup>1</sup> These issues are particularly pronounced in ImageNet-1k, which is multilabel [2, 40, 45] (see Sec. 2). Forcing a single label thus reduces a genuinely multi-valued problem to a selection that is often arbitrary: in ImageNet-1k, it is typically determined by the search query used to retrieve the image rather than by 

> 1A single object may carry multiple labels simultaneously ( _e.g._ a `cardigan` made of `wool` ), see Suppl. Fig. 6. 

_Crowd_ — five or more instances of the same class appear in the image. To reduce annotation effort, they are collapsed into a single bounding box. The Useexact instance count is not recorded, so instance-level counting is not supported for images with this attribute. _Reflection_ — in a mirror or water surface, annotated independently of whether the reflected object itself is also visible in the image. Measures model robustness to reflected appearances and affects instance counting. _Dominant_ — assigned to objects that a person notices immediately upon viewing the image, based on annotator judgment rather than size alone. An image may contain any number of dominant objects ( _e.g._ both `Sealyham Terrier` instances on the left are _dominant_ ). An object may also be the only ImageNet class in the image and still not be dominant ( _e.g._ `metal bottle cap` on the right). Denotes objects with no _attribute_ . 

_Rendition_ — the depicted object visually mimics a class instance but appears as a toy, drawing, or other artificial or stylized representation. Useful for measuring model generalization and robustness. _Text-recognition_ — classification of the object requires reading text visible in the image. Tests whether models can leverage visible text as a recognition cue. 

Figure 2: Annotation extensions: _attributes_ . Objects may have multiple, only one is visualized here. 

any property of the image itself, and it often does not correspond to the visually dominant object. Even adopting a “dominant object” rule would not fully resolve this, since dominance is itself a subjective judgment, and many images contain multiple objects of comparable prominence. 

We thus redefine the ImageNet-1k annotation task as a multilabel assignment and localization of all objects that belong to one of the 1,000 ImageNet-1k classes and are noticeable immediately when the image is viewed (see Fig. 3). The latter condition is motivated by the fact that objects spanning only a few pixels are recognizable purely from context rather than appearance, and labeling them makes the label set subjective and dependent on how hard each annotator chooses to look. We keep the original 1,000 classes rather than adopting an external concept inventory such as WordNet [29] or BabelNet [32], as no such list is reliable: their granularity is uneven and concepts overlap (see Suppl. Sec. A.3). Localization is the natural representation for multilabel annotation: it disambiguates which instance carries each label and extends the benchmark utility beyond classification to object detection, counting, and crop-based evaluation protocols, while also enabling deeper analysis of model behavior, explainability, and interpretability. Each object is annotated with a bounding box enclosing it with a moderate margin.<sup>2</sup> 

Several existing ImageNet-derived benchmarks isolate images with specific visual properties in dedicated datasets [14, 49, 1, 31]. We adopt a similar approach, explicitly marking objects carrying unique visual traits in the form of optionally assigned _attributes_ . Two attributes affect the evaluation protocol: _dominant_ identifies the object a single-label prediction should match, and _crowd_ marks groups of instances covered by one box. Three isolate specific model capabilities: _rendition_ for nonphotographic depictions, _reflection_ for objects visible only on reflective surfaces, and _text-recognition_ for objects identifiable only by reading text in the image (see Fig. 2 and Suppl. Figs. 7 to 11). 

# **4 The Reannotation Process** 

The original ImageNet-1k labels are single-label, frequently miss objects that are present, and contain classes with overlapping definitions (Sec. 2). This is largely a consequence of relying on minimally trained crowd workers. We designed a pipeline built around trained in-house annotators, continuous communication, and quality control. Sec. 4.1 describes the annotation team and the preparation process each annotator follows before labeling images. Sec. 4.2 covers the tools and model-based assistance available. Sec. 4.3 discusses how the pipeline evolved over time. Sec. 4.4 reflects on its inherent limitations. 

> 2Bounding boxes throughout the paper may appear looser than in the actual annotations for illustration purposes, to help the reader distinguish objects in complex scenes. 

(a) ImGT: balloon ReGT: balloon; minivan; car wheel 

(b) ImGT: fountain ReGT: fountain; T-shirt; sock 

Figure 3: Small-scale objects and their zoomed-in crops (right). Such objects are recognizable only from the context. Initially, we aimed to annotate every visible object in the image; small objects, as shown in (a) and (b), right image, discovered during annotation, led to a revision of the definition of what to annotate, see Sec. 3. The `minivan` bounding box has the _crowd_ attribute. 

## **4.1 Annotation Workflow** 

The workflow consists of five components: creating the annotator pool, general annotator training to perform the task defined in Sec. 3, organizing classes into groups and assigning them to annotators, per-class preparation, and image-level labeling. Each is described below. 

**Annotator pool.** The annotation was carried out by a team of 7 non-domain-expert annotators recruited and trained in-house, spanning different age groups (16–50 years old), educational (from high school to university) and cultural backgrounds, geology specialists, canine enthusiasts, and car buffs. The number of active annotators varied during the project, but one lead annotator was present throughout the entire process. This role demanded a basic understanding of machine learning concepts, as decisions such as class name revision are driven by their implications for model evaluation. 

**General annotator training.** Initial training covered familiarization with the problematic class relationships identified in prior work and how to address them, as well as approved annotated examples for each _attribute_ . Hands-on practice with a set of intentionally challenging classes chosen by the authors was also included. Full details of the training process are provided in Suppl. Sec. A.1. 

**Class groups.** Rather than annotating classes in isolation, annotators were assigned classes in groups constructed by clustering classes that share a common parent node in the WordNet [29] hierarchy (source for ImageNet-1k classes). Although we cannot know in advance which specific classes co-occur or cause confusion in a given image (both of which happen frequently, see Sec. 2), grouping classes by their shared parent increases the likelihood that problematic class pairs are presented to annotators together in one batch. Another motivation for grouping is to reduce the cognitive burden: with 1,000 classes in total, keeping track of all possible labels simultaneously places an unreasonable load on annotators, and grouping reduces this to a manageable subset at a time. Where possible, group assignments were made to align with annotators’ personal familiarity with the subject matter, to encourage engagement with the task. Details on group composition are provided in Suppl. Sec. A.2. 

**Per-class preparation protocol.** Before annotating any image, annotators were instructed to follow a structured preparation process. Each annotator examined the image content of each class in their group, recorded a working definition and, where needed, a new class name (original names frequently misrepresent content) in a shared table, and resolved any ambiguities collectively with the authors before proceeding. Full details are provided in Suppl. Sec. A.3. Only after completing this preparation did annotators proceed to image-level labeling, supported by the tools described in Sec. 4.2. 

Throughout all components of the workflow, annotators’ work was continuously reviewed and individual feedback provided via control sets and a supervised communication channel (see Suppl. Sec. A.1). 

## **4.2 Annotation Tools and Resources** 

**Model assistance.** For each image, annotators were provided with top-5 object instance proposals from detector OWLv2 [30], prompted with a list of all ImageNet-1k class names. The generated boxes served as optional starting points that could be accepted, edited, or discarded. Alongside the image, the top-20 OpenCLIP [17] predictions were displayed, together with image examples for each predicted class. This helped annotators spot objects they might otherwise overlook. 

**Additional resources.** For fine-grained species identification and discovery of visually similar species, annotators consulted iNaturalist, which provides expert-verified photographs and taxonomic information. The complete list of known problematic class relationships was available to all annotators. Class names and definitions were recorded in a shared table, serving as the reference for all decisions. 

**The annotation application** supports two complementary views: a grid-based class-level view for quickly browsing multiple images and reviewing class definitions (see Sec. 4.1), and a detailed image-level view for drawing and editing bounding boxes, assigning _attributes_ , and referencing model predictions. A full description of the application and its workflow is provided in Suppl. Sec. A.4. 

## **4.3 Annotation as an Iterative Process** 

**Initial assumptions.** Reannotating ImageNet-1k proved considerably harder than anticipated. The pipeline was designed on the assumption that prior analysis of the dataset’s problems [18] was enough to specify reliable guidelines in advance, and that trained in-house annotators with continuous communication would then be sufficient to produce a reliable benchmark. Neither assumption held. 

**What continuous communication revealed.** In practice, with each question in the group chat and every assigned control set (see Suppl. Sec. A.1), more edge cases were discovered. This caused repeated mid-annotation revisions: new attributes were introduced, class names and definitions updated, and our understanding of which objects should be annotated evolved (see Fig. 3). 

**The limits of human annotation.** A case study in [19] showed that on a set of challenging images where GPT-4o disagreed with our annotations, annotators confirmed (admitted they were wrong) or integrated the GPT-4o prediction in approximately 50% of cases. While this demonstrates that MLLMs are capable annotators that can outperform trained humans, the other 50% (where annotators disagreed with the model and were right) shows that MLLMs are far from a reliable replacement. Two things follow from this: reliable annotation is inherently iterative and cannot be achieved in one shot; and human+MLLM collaboration outperforms either in isolation. 

**Verification phase.** We therefore conducted a second verification phase in which annotators revisited already-annotated images using the finalized guidelines. Inspired by the case study results, OWLv2 and OpenCLIP predictions were replaced by MLLMs predictions from [19] with object localizations generated by SAM3 [3], providing annotators with a stronger optional reference.<sup>3</sup> This does not imply that the initial annotations were unreliable: we consider them to be of good quality, but verification allowed us to catch remaining errors and apply _attributes_ introduced mid-annotation. Examples of changes made during this phase are shown in Suppl. Fig. 15. 

## **4.4 Limitations** 

All annotators share a European background (Czechia, Ukraine, Greece, and Latvia), which may affect how certain concepts are interpreted. Some classes represent objects or practices outside annotators’ cultural experience ( _e.g._ `abaya` ), and while annotators studied such concepts from material available online, cultural nuance may be lost. The same applies to fine-grained wildlife: annotators are non-experts and rely on online resources, which may not fully capture species-level distinctions (a task notoriously difficult even for domain experts [18]). 

Several further sources of noise are inherent to the pipeline. The shared class definition table enforces consistency across annotations, but if a class is defined incorrectly, the error propagates to all images that contain this class. Although model predictions are anonymized and presented as optional references, they may still nudge annotators toward certain labels. 

Finally, our reannotation covers only the validation set; we make no claims about the training set. Due to the distribution shift between training and validation sets [18], our class names and definitions may not accurately reflect the training set, because they are grounded in validation set image content. 

We make all annotations, class names, and definitions publicly available with an option to contribute corrections and suggestions via the annotation preview tool. We see the benchmark as something that should evolve iteratively over time, and invite the community to take part in it. 

> 3We also presented the single-label ILSVRC2012 ImageNet localizations, which were not utilized until this point. 

> [Text inside figure] A 100% / all images / S 64.1% N 4.0% M 31.9% / one ReGT label no ImageNet-1k object several ReGT labels / S+ 58.4% S − 5.6% M+ 29.4% M − 2.5% / ImGT label is the ImGT label is not the ImGT label is among ImGT label is not among / ReGT label ReGT label the ReGT labels the ReGT labels

Figure 4: Image categories induced by ReGT and ImGT, with their share of the 50,000 validation images. + (green) / − (red): the ImGT label agrees / disagrees with ReGT. With L_i the ReGT label set of image i, L*_i its extension with equivalent classes (Sec. 5.1) and gt_i the ImGT label: S = {i : |L_i| = 1}, M = {i : |L_i| > 1}, N = {i : |L_i| = 0}; + means gt_i ∈ L*_i, − means gt_i ∉ L*_i.

# **5 The Dataset Statistics and Properties** 

**Label Statistics.** Following [19], we partition images into the categories shown in Fig. 4. Images are first split by the number of ReGT labels: _single-label_ ( _S_ , 64.1%), _multi-label_ ( _M_ , 31.9%), or none ( _N_ , 4.0%, no ImageNet-1k object). The _S_ and _M_ images are then split by whether the ImGT label agrees with ReGT: for the + subsets ( _S_ +, 58.4%; _M_ +, 29.4%) it does, while for the −subsets ( _S−_ , 5.6%; _M −_ , 2.5%) the original label is wrong. Together, _S−_ , _M −_ and _N_ make up 12.2% of images. 

Our multilabel rate of 31.9% is substantially higher than that of all prior reannotation efforts: ImageNet ReaL [2] (14.9%), Multilabel annotations [40] (18.3%), ImageNetMultiLabel [45] (21.6%), and Label Errors [33] (11.0%), reflecting our originally exhaustive labeling approach (see Fig. 3). Disagreements with labels assigned in prior work are visualized in Suppl. Sec. D. 

> [Text inside figure] Labels mean: 1.56 / 10,000 Labels median: 1.0 / 1,000 BBoxes mean: 1.99 / BBoxes median: 1.0 / 100 Labels / Bounding boxes / 10 / 1 / 0 2 4 6 8 10 12 14 16 18 20

Figure 5: Distributions of the number of labels and bounding boxes per image, log-scaled.

The distributions of labels and bounding boxes per image are shown in Fig. 5. The gap between label and box counts is most commonly due to the appearance of the same class as multiple separate instances in the image, each requiring its own bounding box. Additionally, multi-label objects (a single box with multiple labels, Suppl. Fig. 6) and the _crowd_ attribute (multiple instances collapsed into one box, Fig. 2) influence the statistics. 

## **5.1 Impact of Labeling on Top-1 Accuracy** 

We measured the top-1 ReaL accuracy [2] of MLLM, VLM and supervised models listed in Tab. 1 adapted as in [19] to reflect equivalent class pairs ( _e.g._ `laptop` = `notebook computer` ).<sup>4</sup> Model prediction p_i is correct, _i.e._ α_i = 1, if it is in the image i ReGT label set L*_i, which is the set of labels L_i of image i extended by all equivalent labels from the equivalence set _E_ . Images in _N_ contain no valid ImageNet-1k class and are excluded from evaluation, _i.e._ all accuracies, including those w.r.t. ImGT, are computed on subsets of A\N (47984 images). Model accuracy Acc on image set I ⊆ A\N is then: 

$$\mathrm{Acc} = \frac{1}{|I|}\sum_{i\in I} \alpha_i,\quad \alpha_i = [\,p_i \in L^*_i\,],\quad L^*_i = L_i \cup \{b \mid \exists a \in L_i,\ \{a,b\} \in E\} \qquad (1)$$

Model accuracies are presented in Tab. 1. All models benefit from reannotation, with ReGT accuracy consistently higher than ImGT for all model families (detailed model specifications are provided in Suppl. Sec. B). MLLMs gain the most (GPT-5.4: +5.11%, Qwen3-VL: +6.14%, Gemma 4: 

> 4The full list of equivalent class pairs is available on the dataset page. 

Table 1: Recognition accuracy Acc on image categories defined in Fig. 4 for MLLMs (top), VLMs (middle) and supervised models (bottom). Subscripts denote the number of images in a category. Images in N contain no valid ImageNet-1k class and are excluded from evaluation. Increase in accuracy on ReGT with respect to ImGT is shown for A\N (n=47984). 

|Model|ImGT: A\N (n=47984)|ReGT: A\N (n=47984)|ReGT: S (n=32033)|ReGT: S+ (n=29218)|ReGT: S− (n=2815)|ReGT: M (n=15951)|ReGT: M+ (n=14681)|ReGT: M− (n=1270)|
|---|---|---|---|---|---|---|---|---|
|GPT-5.4 [35]|72.65|77.76+5.11|78.05|81.09|46.47|77.18|80.35|40.55|
|Qwen3-VL [58]|71.09|77.23+6.14|76.24|79.09|46.64|79.21|82.26|43.94|
|Gemma 4 [10]|69.61|75.00+5.39|74.70|77.47|45.93|75.59|78.40|43.07|
|SigLIP [60]|85.01|88.09+3.08|88.62|92.95|43.69|87.02|91.23|38.35|
|SigLIP2 [44]|85.90|88.63+2.73|89.22|93.65|43.16|87.45|91.72|38.11|
|SigLIP2-g [44]|86.80|89.20+2.40|89.80|94.35|42.63|88.01|92.40|37.24|
|DINOv3 [41]|86.54|87.88+1.34|88.98|94.08|36.06|85.67|90.35|31.65|
|EffNetV2 [43]|87.12|88.41+1.29|88.84|93.84|36.98|87.56|92.53|30.00|
|EffNet-L2 [57]|89.84|90.71+0.87|90.79|96.02|36.52|90.56|95.47|33.78|
|EVA-02 [8]|91.36|91.58+0.22|91.59|96.96|35.84|91.56|96.76|31.34|

+5.39%), while gains for supervised models are marginal, nearly vanishing for the strongest models (EffNet-L2: +0.87%, EVA-02: +0.22%). This confirms that models less reliant on supervised training signals are more sensitive to label quality. On the challenging _S−_ and _M −_ subsets, where ImGT disagrees with ReGT, all models have accuracy in the 30–47% range, confirming that these images contain difficult cases. These findings are consistent with [19] on a partial reannotation, now confirmed on the complete validation set. 

Table 2: Accuracy Acc (with ReGT) for images in the S category per visual _attribute_ . Subscripts denote the number of images in a subset. Increase or decrease in accuracy with respect to S are shown. _Mix_ and ∅denote images containing multiple attributes, and no attributes, respectively. 

|Model|S (n=32033)|Crowd (n=1945)|Refl (n=227)|Rend (n=424)|Text (n=287)|Mix (n=91)|∅ (n=29059)|
|---|---|---|---|---|---|---|---|
|GPT-5.4|78.05|78.51+0.46|74.89-3.16|75.00-3.05|87.11+9.06|71.43-6.62|78.02-0.03|
|Qwen3-VL|76.24|79.07+2.83|76.65+0.41|74.06-2.18|91.29+15.05|80.22+3.98|75.92-0.32|
|Gemma 4|74.70|78.10+3.40|74.01-0.69|72.41-2.29|87.11+12.41|68.13-6.57|74.41-0.29|
|SigLIP|88.62|90.28+1.66|90.75+2.13|84.91-3.71|95.12+6.50|91.21+2.59|88.48-0.14|
|SigLIP2|89.22|89.82+0.60|91.63+2.41|85.61-3.61|96.52+7.30|90.11+0.89|89.14-0.08|
|SigLIP2-g|89.80|89.61-0.19|93.39+3.59|86.56-3.24|96.17+6.37|94.51+4.71|89.76-0.04|
|DINOv3|88.98|91.72+2.74|90.31+1.33|82.55-6.43|90.24+1.26|91.21+2.23|88.86-0.12|
|EffNetV2|88.84|90.39+1.55|91.63+2.79|78.54-10.30|82.23-6.61|85.71-3.13|88.94+0.10|
|EffNet-L2|90.79|93.47+2.68|91.19+0.40|84.20-6.59|86.41-4.38|89.01-1.78|90.75-0.04|
|EVA-02|91.59|94.55+2.96|93.83+2.24|87.26-4.33|95.47+3.88|94.51+2.92|91.39-0.20|

**Attribute analysis.** Tab. 2 breaks down ReGT accuracy on single-label images ( _S_ ) by _attribute_ . The _crowd_ attribute improves accuracy for nine of ten models (up to +3.4%), with only a negligible drop for SigLIP 2 g ( −0.2%). The effect of _reflection_ is mixed for MLLMs: GPT-5.4 and Gemma 4 lose accuracy ( −3.2% and −0.7%), while Qwen3-VL is nearly unchanged (+0.4%). All VLMs and all supervised models gain (+0.4 to +3.6%), strongest for SigLIP 2 g (+3.6%) and EffNetV2 (+2.8%). 

The _rendition_ attribute degrades performance for all models, as stylized depictions of objects lie on the long tail of the visual distribution. The drop is smallest for MLLMs ( −2.2% to −3.1%), somewhat larger for VLMs ( −3.2% to −3.7%), and most severe for supervised models (EffNetV2: −10.3%, EffNet-L2: −6.6%, DINOv3: −6.4%; EVA-02 is milder at −4.3%), suggesting that language supervision provides stronger generalization to stylized depictions than standard supervised training. 

The _text-recognition_ attribute shows clear separation across model families: MLLMs and VLMs gain substantially (+6–15%), as language-vision alignment lets them leverage visible text as a semantic feature, while standard supervised models without such alignment suffer drops ( _e.g._ EffNetV2: −6.6%). EVA-02 and DINOv3 also benefit, unlike other supervised models. Qwen3-VL achieves the largest gain (+15.1%), consistent with its results on text-understanding benchmarks [51, 50, 9, 27]. 

## **5.2 Evaluation Protocols Enabled by Localized Annotations** 

Per-instance labeled boxes enable tasks beyond image-level classification. These include singleand multi-label classification, object-centric classification on crops, detection, localization and explainability analysis, and counting (for classes with five or more instances, the group is collapsed into a single _crowd_ box, so in these cases the box count is a lower bound on the true count rather than an exact value). For image-level classification, we adopt the full-image protocol (Sec. 5.1) as the standard in this paper and report results per image category (Tabs. 1 and 2). However, the benchmark is not limited to it. Object-centric classification forms a separate task, which we illustrate with crops. In the end, the choice of protocol is left to the community. 

We create a tight crop for each bounding box, yielding 95,165 crops with an average area of 32% of the original image. We evaluate them in four setups. **All** treats each crop as an independent sample. **Largest** evaluates one crop per image, corresponding to the largest bounding box, approximating the classical ImageNet center-crop evaluation. **Any** considers an image correct if the model correctly classifies at least one of its crops, serving as an upper bound on object-centric accuracy. **ExCrops** expands each tight crop maximally in all four directions without overlapping any other bounding box (via an R-tree); boxes that already overlap another box are excluded. The resulting 38,439 crops (average area of 82%) each contain exactly one annotated object, making ExCrops backwardcompatible with classical single-label object-centric evaluation (see Suppl. Tab. 7). 

Table 3: Acc on object crops in evaluation settings described in Sec. 5.2. Deltas indicate increase/decrease w.r.t. full-image accuracy presented in the Image column.

| Model ↓ / # Imgs. → | Image (47,984) | Largest (47,984) | Any (47,984) | All (95,165) | ExCrops (38,439) |
|---|---|---|---|---|---|
| Gemma 4 | 75.00 | 69.78 −5.2 | 81.67 +6.7 | 61.70 −13.3 | 67.59 −7.4 |
| SigLIP | 88.09 | 81.86 −6.2 | 92.26 +4.2 | 71.51 −16.6 | 79.33 −8.8 |
| SigLIP2 | 88.63 | 82.14 −6.5 | 92.63 +4.0 | 71.69 −16.9 | 79.94 −8.7 |
| SigLIP2-g | 89.20 | 83.02 −6.2 | 93.51 +4.3 | 73.92 −15.3 | 80.93 −8.3 |
| DINOv3 | 87.88 | 78.78 −9.1 | 89.97 +2.1 | 57.04 −30.8 | 76.22 −11.7 |
| EffNetV2 | 88.41 | 80.03 −8.4 | 91.11 +2.7 | 65.75 −22.7 | 78.48 −9.9 |
| EffNet-L2 | 90.71 | 79.93 −10.8 | 90.92 +0.2 | 61.11 −29.6 | 78.89 −11.8 |
| EVA-02 | 91.58 | 81.06 −10.5 | 92.36 +0.8 | 59.67 −31.9 | 79.41 −12.2 |

Table 4: Empirical lower-bound estimates of annotation error in derivative benchmarks, based on GPT-5.4 and SigLIP2-g agreement. INV2, IN-A/R/S: ImageNetV2, -A, -R, -Sketch; ObjN: ObjectNet; CoAn: CounterAnimal.

| Data | # Imgs. | ε̂_IN1k | ε̂_bench | \|I_bench\| | N̂_err |
|---|---|---|---|---|---|
| INV2 | 10,000 | 4.59 | 11.15 | 6,801 | 446 |
| IN-A | 7,500 | 2.52 | 14.80 | 3,541 | 435 |
| IN-R | 30,000 | 2.90 | 4.99 | 22,622 | 472 |
| IN-S | 50,889 | 4.59 | 13.38 | 33,120 | 2,911 |
| ObjN | 18,574 | 5.11 | 8.96 | 11,916 | 459 |
| CoAn | 13,334 | 1.91 | 4.76 | 10,444 | 298 |

Results are shown in Tab. 3. The gap between Any and Largest shows that in ~11% of cases models fail to correctly classify the largest object in the image, yet succeed on a smaller or less salient one. This questions the standard ImageNet evaluation preprocessing. The drop on All crops is most severe for supervised models (EVA-02: −31.9%, DINOv3: −30.8%) and notably smaller for MLLMs. This is likely because supervised ImageNet models are trained on full images and are not optimized for small, tightly cropped objects (see Fig. 3), unlike MLLMs trained on more diverse data. ExCrops recover 6–20% over All crops (most for supervised models), confirming that additional context around each object helps. 

## **5.3 Impact of Errors on Derived Benchmarks** 

We provide an empirical lower-bound estimate of the error rate of derivative benchmarks in Tab. 4. We select two web-scale models with uncorrelated error patterns [19], GPT-5.4 and SigLIP2-g. We then construct an intersection set I_IN1k of images where both models agree on the predicted label. Images with no valid ReGT label are excluded from I_IN1k, consistent with Sec. 5.1. Evaluating I_IN1k against ReGT yields an estimated error rate ε̂_IN1k of 4.59% on the full 1,000 classes. We apply the same procedure to each derivative set restricting I_IN1k to classes present in the target benchmark to obtain I_bench; the corresponding ε̂_IN1k on these class subsets ranges from 1.9% to 5.1%. The resulting ε̂_bench are 1.7–5.9× higher than ε̂_IN1k, indicating that derivative sets inherit and amplify labeling errors. Assuming consistent model behavior on ImageNet-1k and its derivatives, (ε̂_bench − ε̂_IN1k) × |I_bench| provides an empirical lower-bound estimate of the number of mislabeled images N̂_err in each benchmark. 

# **6 Conclusion** 

We presented a from-scratch reannotation of the ImageNet-1k validation set. The original single-label task is well-defined only on a subset of images; elsewhere we recast it as multilabel object localization with revised class definitions. Of the 50,000 images, ≈12% have incorrect ImageNet-1k labels, 31.9% are multilabel and 4.0% contain no valid ImageNet-1k class. MLLMs benefit most from reannotation (+5–6% vs. +0.2–1.3% for supervised models). Attribute-level analysis reveals that language-vision alignment lets MLLMs leverage visible text (+9–15%). All model families struggle with stylized depictions ( _i.e. renditions_ ). Object-centric evaluation on bounding-box crops shows that supervised models lose up to 32% accuracy when scene context is removed, whereas MLLMs are substantially more robust. Annotation errors propagate into derivative benchmarks at 1.7–5.9 ×the ImageNet-1k rate. Our annotation experience confirms that without substantial training or domain expertise, an LLM alone outperforms crowd annotators; human–LLM collaboration outperforms both. 

**Implications and recommendations.** Errors in the original benchmark propagate into its derivative evaluation sets (Sec. 5.3), and the same structural pressures now reproduce themselves in modern MLLM benchmarks: whether crowdsourced under the conditions that produced ImageNet-1k’s noise [5, 28], or annotated by the very models they are meant to evaluate [7, 23], which risks measuring consistency with the annotator-model’s training distribution rather than genuine capability. The lessons of ImageNet-1k have, by and large, not been absorbed; the cost of ignoring them keeps rising. Noisy benchmarks were defensible when models trailed humans by a wide margin. Today, MLLMs routinely match or exceed untrained crowd annotators on the labeling task itself. 

We argue in favor of abandoning the one-shot model of benchmark construction. The highest quality currently achievable at scale comes from trained annotators paired with anonymized MLLM predictions and dedicated tooling, with a lead annotator bridging the research and labeling teams. Where domain-engaged resources exist, whether citizen-science platforms (iNaturalist, eBird) or expert-curated databases (mycological references and similar), they provide a level of curation that generic crowdsourcing cannot match and should serve as anchors for fine-grained class annotations. 

**Limitations and Broader Impacts.** The reannotation retains residual inter-annotator variance: which objects to notice, which to mark as dominant, and where exactly to draw bounding boxes. The pipeline relies on closed-source MLLMs (GPT-4o, GPT-5.4) whose outputs are not repeatable and whose availability may change. More accurate ImageNet-1k ground truth and a transferable methodology for estimating label noise enable better-calibrated claims about model performance and lower the cost of auditing widely-used benchmarks; on the other hand, (i) our work inherits ImageNet1k’s known issues around problematic categories and image provenance, which reannotation does not address; (ii) defining label quality via model-ensemble agreement risks entrenching current architectures’ inductive biases; and (iii) a “cleaner” benchmark may produce unwarranted confidence in evaluation results that remain limited by distribution shift and construction validity. 

# **Acknowledgments and Disclosure of Funding** 

Illia Volkov and Nikita Kisel were supported by EquiLibre Technologies, Klara Janouskova by the CTU grant SGS26/074/OHK3/1T/13. The work was also supported by the Technology Agency of the Czech Republic within the SIGMA Programme project No. TQ28000003 NCIU National Center for Artificial Intelligence and by the EC Digital Europe Programme project CEDMO 2.0 no. 101158609. The access to the computational infrastructure of the OP VVV funded project CZ.02.1.01/0.0/0.0/16_019/0000765 “Research Center for Informatics” is gratefully acknowledged. 

**Competing interests.** The authors declare no competing interests. 

# **References** 

- [1] A. Barbu, D. Mayo, J. Alverio, W. Luo, C. Wang, D. Gutfreund, J. Tenenbaum, and B. Katz. Objectnet: A large-scale bias-controlled dataset for pushing the limits of object recognition models. In H. Wallach, H. Larochelle, A. Beygelzimer, F. d'Alché-Buc, E. Fox, and R. Garnett, editors, _Advances in Neural Information Processing Systems_ , volume 32. Curran Associates, Inc., 2019. URL `https://proceedings.neurips.cc/paper_files/paper/2019/file/ 97af07a14cacba681feacf3012730892-Paper.pdf` . 

- [2] L. Beyer, O. J. Hénaff, A. Kolesnikov, X. Zhai, and A. van den Oord. Are we done with imagenet?, 2020. URL `https://arxiv.org/abs/2006.07159` . 

- [3] N. Carion, L. Gustafson, Y.-T. Hu, and S. D. et al. Sam 3: Segment anything with concepts, 2026. URL `https://arxiv.org/abs/2511.16719` . 

- [4] L. Chen, J. Li, X. Dong, P. Zhang, C. He, J. Wang, F. Zhao, and D. Lin. Sharegpt4v: Improving large multi-modal models with better captions. In _European Conference on Computer Vision_ , pages 370–387. Springer, 2024. 

- [5] L. Chen, J. Li, X. Dong, P. Zhang, Y. Zang, Z. Chen, H. Duan, J. Wang, Y. Qiao, D. Lin, et al. Are we on the right way for evaluating large vision-language models? _arXiv preprint arXiv:2403.20330_ , 2024. 

- [6] J. Deng, W. Dong, R. Socher, L.-J. Li, K. Li, and L. Fei-Fei. ImageNet: A large-scale hierarchical image database. In _CVPR_ , 2009. 

- [7] Y. Ding, X. Shi, X. Liang, J. Li, Z. Tu, Q. Zhu, and M. Zhang. Unleashing llm reasoning capability via scalable question synthesis from scratch. _https://arxiv.org/abs/2410.18693_ , 2024. 

- [8] Y. Fang, Q. Sun, X. Wang, T. Huang, X. Wang, and Y. Cao. Eva-02: A visual representation for neon genesis. _Image and Vision Computing_ , 149:105171, Sept. 2024. ISSN 0262-8856. doi: 10.1016/j.imavis.2024.105171. URL `http://dx.doi.org/10.1016/j.imavis.2024. 105171` . 

- [9] L. Fu, Z. Kuang, J. Song, M. Huang, B. Yang, Y. Li, L. Zhu, Q. Luo, X. Wang, H. Lu, Z. Li, G. Tang, B. Shan, C. Lin, Q. Liu, B. Wu, H. Feng, H. Liu, C. Huang, J. Tang, W. Chen, L. Jin, Y. Liu, and X. Bai. Ocrbench v2: An improved benchmark for evaluating large multimodal models on visual text localization and reasoning, 2025. URL `https://arxiv.org/abs/ 2501.00321` . 

- [10] Gemma Team, Google DeepMind. Gemma 4. `https://ai.google.dev/gemma/docs/ core/model_card_4` , 2026. Model card. 

- [11] F. Gilardi, M. Alizadeh, and M. Kubli. Chatgpt outperforms crowd workers for text-annotation tasks. _Proceedings of the National Academy of Sciences_ , 120(30), July 2023. ISSN 1091-6490. doi: 10.1073/pnas.2305016120. URL `http://dx.doi.org/10.1073/pnas.2305016120` . 

- [12] A. Hatamizadeh and J. Kautz. Mambavision: A hybrid mamba-transformer vision backbone, 2025. URL `https://arxiv.org/abs/2407.08083` . 

- [13] D. Hendrycks and T. Dietterich. Benchmarking neural network robustness to common corruptions and perturbations. _Proceedings of the International Conference on Learning Representations_ , 2019. 

- [14] D. Hendrycks, S. Basart, N. Mu, S. Kadavath, F. Wang, E. Dorundo, R. Desai, T. Zhu, S. Parajuli, M. Guo, D. Song, J. Steinhardt, and J. Gilmer. The many faces of robustness: A critical analysis of out-of-distribution generalization. _ICCV_ , 2021. 

- [15] D. Hendrycks, K. Zhao, S. Basart, J. Steinhardt, and D. Song. Natural adversarial examples, 2021. URL `https://arxiv.org/abs/1907.07174` . 

- [16] B. Y. Idrissi, D. Bouchacourt, R. Balestriero, I. Evtimov, C. Hazirbas, N. Ballas, P. Vincent, M. Drozdzal, D. Lopez-Paz, and M. Ibrahim. Imagenet-x: Understanding model mistakes with factor of variation annotations, 2022. URL `https://arxiv.org/abs/2211.01866` . 

- [17] G. Ilharco, M. Wortsman, R. Wightman, C. Gordon, N. Carlini, R. Taori, A. Dave, V. Shankar, H. Namkoong, J. Miller, H. Hajishirzi, A. Farhadi, and L. Schmidt. Openclip, July 2021. URL `https://doi.org/10.5281/zenodo.5143773` . If you use this software, please cite it as below. 

- [18] N. Kisel, I. Volkov, K. Hanzelkova, K. Janouskova, and J. Matas. Flaws of imagenet, computer vision’s favourite dataset. _arXiv preprint arXiv:2412.00076_ , 2024. 

- [19] N. Kisel, I. Volkov, K. Janouskova, and J. Matas. Multimodal large language models as image classifiers, 2026. URL `https://arxiv.org/abs/2603.06578` . 

- [20] R. Krishna, Y. Zhu, O. Groth, J. Johnson, K. Hata, J. Kravitz, S. Chen, Y. Kalantidis, L.-J. Li, D. A. Shamma, M. S. Bernstein, and F.-F. Li. Visual genome: Connecting language and vision using crowdsourced dense image annotations, 2016. URL `https://arxiv.org/abs/1602. 07332` . 

- [21] M. Lease. On quality control and machine learning in crowdsourcing. _Human Computation_ , 11 (11):1085, 2011. 

- [22] T.-Y. Lin, M. Maire, S. Belongie, L. Bourdev, R. Girshick, J. Hays, P. Perona, D. Ramanan, C. L. Zitnick, and P. Dollár. Microsoft coco: Common objects in context, 2015. URL `https://arxiv.org/abs/1405.0312` . 

- [23] H. Liu, C. Li, Q. Wu, and Y. J. Lee. Visual instruction tuning, 2023. URL `https://arxiv. org/abs/2304.08485` . 

- [24] Y. Liu, Y. Tian, Y. Zhao, H. Yu, L. Xie, Y. Wang, Q. Ye, J. Jiao, and Y. Liu. Vmamba: Visual state space model, 2024. URL `https://arxiv.org/abs/2401.10166` . 

- [25] Z. Liu, Z. Miao, X. Zhan, J. Wang, B. Gong, and S. X. Yu. Large-scale long-tailed recognition in an open world. In _IEEE Conference on Computer Vision and Pattern Recognition (CVPR)_ , 2019. 

- [26] Z. Liu, H. Hu, Y. Lin, Z. Yao, Z. Xie, and Y. W. et al. Swin transformer v2: Scaling up capacity and resolution, 2022. URL `https://arxiv.org/abs/2111.09883` . 

- [27] A. Masry, D. X. Long, J. Q. Tan, S. Joty, and E. Hoque. Chartqa: A benchmark for question answering about charts with visual and logical reasoning, 2022. URL `https://arxiv.org/ abs/2203.10244` . 

- [28] F. Meng, J. Wang, C. Li, Q. Lu, H. Tian, J. Liao, X. Zhu, J. Dai, Y. Qiao, P. Luo, K. Zhang, and W. Shao. Mmiu: Multimodal multi-image understanding for evaluating large vision-language models, 2024. URL `https://arxiv.org/abs/2408.02718` . 

- [29] G. A. Miller. WordNet: A lexical database for English. In _Human Language Technology: Proceedings of a Workshop held at Plainsboro, New Jersey, March 8-11, 1994_ , 1994. URL `https://aclanthology.org/H94-1111/` . 

- [30] M. Minderer, A. Gritsenko, and N. Houlsby. Scaling open-vocabulary object detection, 2024. URL `https://arxiv.org/abs/2306.09683` . 

- [31] M. Moayeri, S. Singla, and S. Feizi. Hard imagenet: Segmentations for objects with strong spurious cues, June 2022. 

- [32] R. Navigli and S. P. Ponzetto. BabelNet: The automatic construction, evaluation and application of a wide-coverage multilingual semantic network. _Artificial Intelligence_ , 193:217–250, 2012. doi: 10.1016/j.artint.2012.07.001. 

- [33] C. G. Northcutt, A. Athalye, and J. Mueller. Pervasive label errors in test sets destabilize machine learning benchmarks, 2021. URL `https://arxiv.org/abs/2103.14749` . 

- [34] Y. Onoe, S. Rane, Z. Berger, Y. Bitton, J. Cho, R. Garg, A. Ku, Z. Parekh, J. Pont-Tuset, G. Tanzer, S. Wang, and J. Baldridge. DOCCI: Descriptions of Connected and Contrasting Images. In _ECCV_ , 2024. 

- [35] OpenAI. Introducing GPT-5.4. `https://openai.com/index/introducing-gpt-5-4/` , 2026. Accessed: 2026-05-05. 

- [36] OpenAI et al. Gpt-4o system card, 2024. URL `https://arxiv.org/abs/2410.21276` . 

- [37] A. Radford, J. W. Kim, C. Hallacy, A. Ramesh, G. Goh, S. Agarwal, G. Sastry, A. Askell, P. Mishkin, J. Clark, G. Krueger, and I. Sutskever. Learning transferable visual models from natural language supervision, 2021. URL `https://arxiv.org/abs/2103.00020` . 

- [38] B. Recht, R. Roelofs, L. Schmidt, and V. Shankar. Do imagenet classifiers generalize to imagenet?, 2019. URL `https://arxiv.org/abs/1902.10811` . 

- [39] O. Russakovsky, J. Deng, H. Su, J. Krause, S. Satheesh, S. Ma, Z. Huang, A. Karpathy, A. Khosla, M. Bernstein, A. C. Berg, and L. Fei-Fei. Imagenet large scale visual recognition challenge, 2015. URL `https://arxiv.org/abs/1409.0575` . 

- [40] V. Shankar, R. Roelofs, H. Mania, A. Fang, B. Recht, and L. Schmidt. Evaluating machine accuracy on ImageNet. In H. D. III and A. Singh, editors, _Proceedings of the 37th International Conference on Machine Learning_ , volume 119 of _Proceedings of Machine Learning Research_ , pages 8634–8644. PMLR, 13–18 Jul 2020. URL `https://proceedings.mlr.press/v119/ shankar20c.html` . 

- [41] O. Siméoni, H. V. Vo, M. Seitzer, F. Baldassarre, M. Oquab, C. Jose, and V. K. et al. Dinov3, 2025. URL `https://arxiv.org/abs/2508.10104` . 

- [42] V. Singla, K. Yue, S. Paul, R. Shirkavand, M. Jayawardhana, A. Ganjdanesh, H. Huang, A. Bhatele, G. Somepalli, and T. Goldstein. From pixels to prose: A large dataset of dense image captions, 2024. URL `https://arxiv.org/abs/2406.10328` . 

- [43] M. Tan and Q. V. Le. Efficientnetv2: Smaller models and faster training, 2021. URL `https: //arxiv.org/abs/2104.00298` . 

- [44] M. Tschannen, A. Gritsenko, X. Wang, M. F. Naeem, and I. A. et al. Siglip 2: Multilingual visionlanguage encoders with improved semantic understanding, localization, and dense features, 2025. URL `https://arxiv.org/abs/2502.14786` . 

- [45] D. Tsipras, S. Santurkar, L. Engstrom, A. Ilyas, and A. Madry. From imagenet to image classification: Contextualizing progress on benchmarks, 2020. URL `https://arxiv.org/ abs/2005.11295` . 

- [46] J. Urbanek and P. Ringshia. Mephisto: A framework for portable, reproducible, and iterative crowdsourcing, 2023. URL `https://arxiv.org/abs/2301.05154` . 

- [47] G. Van Horn, S. Branson, R. Farrell, S. Haber, J. Barry, P. Ipeirotis, P. Perona, and S. Belongie. Building a bird recognition app and large scale dataset with citizen scientists: The fine print in fine-grained dataset collection. In _2015 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)_ , pages 595–604, 2015. doi: 10.1109/CVPR.2015.7298658. 

- [48] V. Vasudevan, B. Caine, R. Gontijo-Lopes, S. Fridovich-Keil, and R. Roelofs. When does dough become a bagel? analyzing the remaining mistakes on imagenet, 2022. URL `https: //arxiv.org/abs/2205.04596` . 

- [49] H. Wang, S. Ge, E. P. Xing, and Z. C. Lipton. Learning robust global representations by penalizing local predictive power, 2019. URL `https://arxiv.org/abs/1905.13549` . 

- [50] K. Wang, J. Pan, W. Shi, Z. Lu, H. Ren, A. Zhou, M. Zhan, and H. Li. Measuring multimodal mathematical reasoning with math-vision dataset. In _The Thirty-eight Conference on Neural Information Processing Systems Datasets and Benchmarks Track_ , 2024. URL `https:// openreview.net/forum?id=QWTCcxMpPA` . 

- [51] K. Wang, J. Pan, L. Wei, A. Zhou, W. Shi, Z. Lu, H. Xiao, Y. Yang, H. Ren, M. Zhan, and H. Li. Mathcoder-VL: Bridging vision and code for enhanced multimodal mathematical reasoning. In _The 63rd Annual Meeting of the Association for Computational Linguistics_ , 2025. URL `https://openreview.net/forum?id=nuvtX1imAb` . 

- [52] Q. Wang, Y. Lin, Y. Chen, L. Schmidt, B. Han, and T. Zhang. A sober look at the robustness of clips to spurious features, 2024. URL `https://arxiv.org/abs/2403.11497` . 

- [53] W. Wang, J. Dai, Z. Chen, Z. Huang, Z. Li, X. Zhu, X. Hu, T. Lu, L. Lu, H. Li, X. Wang, and Y. Qiao. Internimage: Exploring large-scale vision foundation models with deformable convolutions, 2023. URL `https://arxiv.org/abs/2211.05778` . 

- [54] R. Wightman. Pytorch image models. `https://github.com/rwightman/ pytorch-image-models` , 2019. 

- [55] S. Woo, S. Debnath, R. Hu, X. Chen, Z. Liu, I. S. Kweon, and S. Xie. Convnext v2: Codesigning and scaling convnets with masked autoencoders, 2023. URL `https://arxiv.org/ abs/2301.00808` . 

- [56] M.-K. Xie, J.-H. Xiao, Z. Kou, Z. Li, G. Niu, and M. Sugiyama. Are multimodal large language models good annotators for image tagging?, 2026. URL `https://arxiv.org/abs/2602. 20972` . 

- [57] Q. Xie, M.-T. Luong, E. Hovy, and Q. V. Le. Self-training with noisy student improves imagenet classification, 2020. URL `https://arxiv.org/abs/1911.04252` . 

- [58] A. Yang, A. Li, B. Yang, B. Zhang, B. Hui, B. Zheng, B. Yu, C. Gao, C. Huang, C. Lv, and C. Z. et al. Qwen3 technical report, 2025. URL `https://arxiv.org/abs/2505.09388` . 

- [59] S. Yun, S. J. Oh, B. Heo, D. Han, J. Choe, and S. Chun. Re-labeling imagenet: from single to multi-labels, from global to localized labels, 2021. URL `https://arxiv.org/abs/2101. 05022` . 

- [60] X. Zhai, B. Mustafa, A. Kolesnikov, and L. Beyer. Sigmoid loss for language image pre-training, 2023. URL `https://arxiv.org/abs/2303.15343` . 

# **A Annotation Pipeline** 

## **A.1 Annotator Training and Quality Control** 

**Problematic class relationships.** Annotators studied problematic class relationships (identified in [18]) prior to annotation. These include subclass–superclass overlaps, such as `elephant` _⊂_ `tusker` or `bathtub` _⊂_ `tub` , resolved in annotation by selecting the most specific applicable class; partof relationships such as `space bar` _⊂_ `keyboard` , resolved by annotating all classes present in the image; and near-synonym classes such as `laptop` / `notebook` , `shore` / `lakeside` , and `swimsuit` / `maillot` , resolved by selecting any one of the synonymous classes consistently (nearsynonyms list builds on [2, 48, 19], extended through our annotation process). 

**Attribute and multi-label object examples.** Annotators worked through approved annotated examples for each _attribute_ , similar to those shown in Figs. 7 to 11. Besides, they were familiarized with the existence of multi-label objects ( _i.e._ single objects belonging to multiple non-hierarchically related classes, therefore assigned multiple labels). Classes that frequently require multi-label annotation include materials like `wool` and `velvet` ; more examples are shown in Fig. 6. 

**Training classes and quality assessment.** Annotators gained hands-on experience with the task and familiarized themselves with the annotation app using a set of intentionally challenging training classes chosen by the authors: visually similar concepts that are easily confused ( _e.g._ not every camera is a `reflex camera` ), uncommon concepts that also tested localization decisions ( _e.g._ how to draw a bounding box for `spotlight` ), and images in which multiple ImageNet classes appear simultaneously. The authors manually reviewed these training annotations against a predefined quality threshold. Annotators who met it proceeded to real tasks; those who did not received targeted feedback and additional training classes, after which the review process was repeated. 

**Control sets.** To monitor annotation consistency beyond the initial training phase, we periodically assigned the same image sets to multiple annotators (who did not know it was a control set, but sometimes found out when discussing problems) and compared their outputs. Control sets typically consisted of 2–3 carefully selected classes, often from the same class group (see Sec. 4.1 and Suppl. Sec. A.2). Annotators who fell below the expected standard received targeted feedback and were asked to revisit their annotations. Beyond individual control, this process revealed edge cases the guidelines had not yet covered, playing an important role in the iterative protocol updates described in Sec. 4.3. 

(a) ImGT: agaric (b) ImGT: wall clock (c) ImGT: cardigan ReGT: agaric; ReGT: wall clock; ReGT: cardigan; wool mushroom analog clock 

> [Text inside figure] (d) ImGT: CRT screen / ReGT: CRT screen; / computer keyboard; web- / site; monitor

Figure 6: Multilabel objects in ImageNet-1k, _i.e._ objects with multiple valid labels. Some objects exhibit strict hierarchy, where a class is a subclass of another: _e.g._ (a) all `agaric` are `mushroom` . Super-classes are added automatically, so annotators only need to label the most specific class. Other classes show more complex relations: _e.g._ (b) this `wall clock` is also an `analog clock` , but not all wall clocks are analog, (c) this specific `cardigan` is made of `wool` , but not all cardigans are, (d) this `CRT screen` is a `monitor` , but not all CRTs are. In these cases, the annotators need to label all of the classes. 

> [Text inside figure] (a) ImGT: triceratops (b) ImGT: electric guitar (c) ImGT: tabby cat / ReGT: triceratops ReGT: electric guitar ReGT: tabby cat

> [Text inside figure] (d) ImGT: cucumber / ReGT: cucumber; wool

Figure 7: Images containing objects with the _<u>rendition</u>_ attribute. The attribute is used when the depicted object visually mimics an instance of the original class, but appears as a toy, drawing, sculpture, or other representation. In some categories ( _e.g._ `triceratops` ), real photographs cannot exist, and all images are renditions. In (d), `cucumber` is a multilabel object, see Fig. 6. 

> [Text inside figure] (a) ImGT: barrel (b) ImGT: guinea pig / ReGT: barrel ReGT: guinea pig

> [Text inside figure] (c) ImGT: Christmas stocking / ReGT: Christmas stocking

Figure 8: Images containing bounding boxes with the _<u>crowd</u>_ attribute. The attribute is used when the image depicts five or more instances of the same class, all of which share identical values for the other (optional) attributes, to simplify the annotation process. 

## **A.2 Class Group Details** 

Classes are organized into 97 groups ranging from 1 to 59 classes, with a median of 7 and an average of 10 classes per group. Groups were constructed by clustering classes that share a common parent node in the WordNet hierarchy. However, they required substantial manual revision: WordNet parent assignments frequently produced semantically incoherent groupings, and the granularity of the hierarchy is highly unbalanced. This is unsurprising given that ImageNet-1k classes were scraped as WordNet leaf nodes, but they still share hierarchical relationships (one class being a subset of another, or classes being near-synonyms [2, 48, 18]). 

The largest group, `birds` (59 classes), is an outlier: unlike dogs, which are naturally split into fine-grained subgroups ( _e.g._ terriers, hounds, retrievers), birds lack a similarly clean taxonomic subdivision at the ImageNet-1k level (or the authors lack the domain knowledge to identify one). 

## **A.3 Per-Class Preparation Protocol** 

We describe the per-class preparation protocol each annotator was instructed to follow before annotating any image in their assigned group. Annotators were not time-constrained; it was up to their judgment to decide when they were familiar enough with the subject to start annotating. 

**Examining class content.** Annotators first examined the actual image content of each class in their assigned group rather than relying on class names alone — the inverse of the original ImageNet-1k procedure [6], where crowd workers were shown an image and asked to verify a given label. This step was necessary because ImageNet class names frequently misrepresent their content: the original annotation process often diverged a class entirely from its WordNet definition ( _e.g._ `tiger cat` in practice contains striped tabby cats, oncillas, and tigers [18]). 

The preparation involved consulting external references ( _e.g._ Wikipedia, iNaturalist) to create reliable visual identification criteria for each class. Annotators identified the key distinguishing features that help with recognition ( _e.g._ for a snake class, features such as head shape, body pattern, or scale texture), detected common confusions ( _e.g._ two insect classes that belong to the same order but differ 

> [Text inside figure] (a) ImGT=ReGT: (b) ImGT=ReGT: (c) ImGT=ReGT: (d) ImGT=ReGT: / sunscreen bookstore bakery beer bottle

Figure 9: Images containing objects with the _text-recognition_ attribute, where image classification relies on reading and interpreting text. 

> [Text inside figure] (a) ImGT: car mirror (b) ImGT: gray wolf (c) ImGT: car mirror / ReGT: car mirror; sunglasses ReGT: gray wolf ReGT: car mirror; golden retriever

Figure 10: Images containing objects with the _reflection_ attribute. This attribute is used regardless of whether the reflected object is visible (b) or not (a, c). Compact camera is not an ImageNet-1k class. 

in antenna length and body shape), and verified that the actual images in the class match the expected visual content. 

**Class definition writing.** Based on the previous examination, the annotator recorded a working definition for each class in a shared table, grounded in actual image content rather than the WordNet label (the ImageNet-1k basis for class definitions, which was often lost during data collection and labeling). For unambiguous classes ( _e.g._ `tennis ball` ) this was brief; for problematic ones this could take considerably longer. For instance, `ear, spike, capitulum` nominally refers to grain spikes by its WordNet definition, but the overwhelming majority of images depict `corn` (in the American sense) in various forms — an obvious discrepancy that must be resolved before annotation begins. 

When the class name was misleading or the image content was highly diverse, the definition was settled collectively in a supervised group chat in which the authors actively participated. Solutions were individual to each class: for unambiguous mismatches we adopted a renaming; for classes with mixed or ambiguous content the resolution was more involved. Throughout this process, we maintained a strong preference for preserving original images over discarding them — we would rather revise a class name to better reflect the actual image content than remove images from the dataset. Our per-class definitions are publicly available and will be updated as further issues are identified by the community (see Sec. 4.4). 

## **A.4 Annotation App** 

We developed a custom web-based annotation application designed to support the pipeline described in Sec. 4.1. The application integrates model predictions (OWLv2 bounding box proposals and OpenCLIP image predictions in the main phase; MLLM predictions with SAM3 localizations in the verification phase), per-class definitions, and cross-class navigation into a single interface designed to support both class-level review and per-image annotation. It provides two complementary views: a grid-based class-level view and a detailed image-level view. 

**Main phase.** Work begins in grid mode, where annotators browse multiple images per class and propose class definitions as described in Secs. A.3 and 4.1. The grid displays images in batches, 

> [Text inside figure] (a) ImGT: doormat (b) ImGT: hockey puck / ReGT: doormat ReGT: hockey puck

(c) ImGT: lens cap (d) ImGT: Persian cat ReGT: lens cap ReGT: Persian cat; carton 

Figure 11: Examples illustrating the _<u>dominant</u>_ attribute. Dominance is entirely context-dependent and does not correlate with object size: (a) `doormat` occupies most of the image yet is not _dominant_ , (b) `hockey puck` is small but immediately draws attention and is marked _dominant_ , (c) `lens cap` is large yet not _dominant_ given the surrounding scene, and (d) `Persian cat` is marked _dominant_ despite sharing the image with `carton` . 

> [Text inside figure] (a) ImGT: sunscreen

ReGT: no valid label 

> [Text inside figure] (b) ImGT: sunscreen

ReGT: sunscreen; bikini 

Figure 12: The role of context in image recognition. Both images show a cream-like white substance on skin. In (a), the festival-like background and characteristic stripes on the face suggest it is body paint. In (b), a woman in a bikini on the beach and wearing a sun hat suggests it is `sunscreen` . Either interpretation could apply to both images. We can only make an educated guess based on the context. 

allowing annotators to quickly assess the overall content of a class and check existing annotations in context. A progress bar indicates how many images in the current class have been annotated. Annotators can navigate between classes within their assigned group via a dropdown menu. Each image in the grid shows a checkmark indicating whether it has been annotated. 

After inspecting the classes, annotators proceed to the image-level labeling workflow, illustrated in Fig. 13. Bounding boxes are drawn by holding the left mouse button and can be selected, resized by dragging their edges, or deleted. Each selected box can be assigned a class label via a dropdown menu, and one or more _attributes_ can be toggled via checkboxes or keyboard shortcuts. When an object belongs to multiple non-hierarchically related classes (see Fig. 6), annotators use multi-label mode to assign several labels to a single box rather than drawing separate boxes. 

If an annotator is uncertain about the class of an object, they can mark it using the _Not sure_ button, optionally selecting one or more candidate classes. Such boxes are highlighted in yellow and revisited during the second verification phase (see Sec. 4.3). If no ImageNet-1k class is present in the image at all, annotators select _None of ImageNet classes_ instead. The _Not sure_ option is preferred over this when any doubt remains, to avoid missing valid objects and discarding images from the dataset. 

Below the image editor, the top-20 OpenCLIP class predictions are displayed alongside example images from the dataset for each predicted class. Annotators can zoom into any example image for a closer look and use a refresh button to load alternative examples. If a predicted class appears to be present in the image, annotators can check its checkbox so that the next drawn box is automatically assigned to that class. Annotations are saved automatically whenever the annotator navigates to another image or returns to the grid. Annotators were instructed to upload their work to a shared storage at the end of each working session using the _Upload_ button in grid mode. 

Figure 13: Annotation application workflow. Screenshots illustrate the annotation loop supported by the application. (1) Select an image from the task queue, organized by class and browsable in a grid view for class-level inspection and definition review. (2) Switch to the image-level mode to draw bounding boxes, add _attributes_ , edit existing annotations, and reference model predictions. (3) After completing the current image, proceed to the next, repeating the loop. 

(a) Image-level view with MLLM+SAM3 proposals shown as dashed bounding boxes. 

(b) Prediction panel with class descriptions and annotation guidelines for each proposed class. 

Figure 14: Annotation application update for the verification phase. The core functionality remains the same as in the main phase; the key changes are the replacement of OWLv2/OpenCLIP predictions with MLLM+SAM3 proposals and the addition of class definitions directly in the prediction panel. 

**In the verification phase** (see Sec. 4.3), the annotation application was updated to support the new workflow while retaining the same core functionality. The main changes are illustrated in Fig. 14. 

OWLv2 bounding box proposals and OpenCLIP top-20 predictions from the main phase are replaced by MLLM predictions with SAM3-generated localizations [3]. These appear as dashed bounding boxes overlaid on the image (Fig. 14, left); annotators can click on a dashed box to accept and copy it if they agree with the model proposal. Below the image, each prediction is displayed alongside the corresponding class description and annotation guidelines (Fig. 14, right), allowing annotators to verify predictions against the shared class definitions directly within the interface. Annotators can check the prediction checkbox to reveal the localization for the proposed box (the previously mentioned dashed boxes). 

Figure 15: Examples of annotation changes made during the second verification phase. Each row shows a before (left) and after (right) pair. Colors denote objects with: no attributes, _rendition_ attribute, _reflection_ attribute. Annotators add previously unnoticed objects, verify that existing annotations correspond to finalized class definitions, and assign attributes that were introduced or clarified mid-annotation. 

# **B Experimental setup details** 

**Model pool.** Below we list the models used for evaluation in the paper, with the exact model version each name refers to. GPT-5.4 is the model used through the OpenAI Responses API. Qwen3-VL refers to the `Qwen3-VL-235B-A22B-it` model. Gemma 4 is the `Gemma-4-31B-it` . SigLIP, SigLIP2, SigLIP2-g refer to `SigLIP so400M/14-384` , `SigLIP 2 so400M/16-384` , and `SigLIP 2 ViT/g-opt-384` versions. DINOv3 refers to the `DINOv3 ViT-7B` encoder used to obtain image embeddings and perform _k_ -NN search in the embedding space; the best _k_ =11 is selected for all experiments based on ReGT accuracy. EffNetV2, EffNet-L2 are supervised models referring to `EfficientNetV2-XL` and `EfficientNet-L2` . The best Timm [54] leaderboard ImageNet-1k model `EVA-02 ViT-L-14-448` is used and referred to as EVA-02. 

**MLLMs image classification.** Leveraging MLLMs image classification knowledge, the setup commonly referred to as “OW” in the field is selected for all experiments. A single prompt is used for all MLLMs, matching exactly the one located in the supplementary of our prior paper [19]. The encoder choice matches exactly our prior work too, utilizing the best-performing encoder per model `Qwen3-Embedding-8B / SigLIP 2 ViT/g-opt-384 (text encoder)` . A class name templating trick following [37] is used before tokenization for both MLLMs and VLMs. 

**Computational resources.** All experiments were conducted on the local university server. The required computational resources varied considerably across tasks: smaller experiments utilized a single NVIDIA A100 SXM4 40 GB GPU on an AMD EPYC 7543/7763 CPU cluster, while the largest model in our experiments: `Qwen3-VL-235B-A22B` required 4-6 NVIDIA HGX H200 GPUs on an AMD EPYC 9355 CPU cluster. Experiment runtimes ranged from approximately 10 minutes to a maximum of 72 hours. 

# **C Additional Results** 

Table 5: Top-1 ReGT accuracy on _M_ by ground-truth bounding box area. Index _i_ denotes the _i_ -th largest box. Columns _in_ report accuracy for the _i_ -th largest box over _n_ images. Columns _≤ in_ report ReaL accuracy, treating the top- _i_ boxes as valid labels. lim _i→∞_ Acc _≤i_ ( _subset_ ) = AccReGT( _M_ ). 

|Model|Dom (n=601)|i=1: 1st largest box (n=15951)|i=2 (n=15668)|i=3 (n=9333)|i=4 (n=5867)|i=5 (n=3840)|≤2: top-2 boxes (n=15951)|≤3 (n=15951)|≤4 (n=15951)|≤5 (n=15951)|M (n=15951)|
|---|---|---|---|---|---|---|---|---|---|---|---|
|GPT-5.4|75.37|50.06|26.22|16.55|11.03|7.71|71.90|75.71|76.62|76.94|77.18|
|Qwen3-VL|73.21|51.76|26.38|16.40|10.89|7.99|73.57|77.52|78.44|78.82|79.21|
|Gemma 4|78.37|48.35|25.93|16.48|11.25|7.94|69.92|74.02|74.94|75.29|75.59|
|SigLIP|76.87|56.16|30.20|18.60|12.46|8.59|81.29|85.47|86.35|86.69|87.02|
|SigLIP2|79.20|56.28|30.53|18.46|12.24|8.91|81.66|85.80|86.72|87.10|87.45|
|SigLIP2-g|78.87|56.49|30.73|18.65|12.48|8.62|82.07|86.36|87.30|87.64|88.01|
|DINOv3|74.88|54.89|30.02|18.40|12.46|9.14|79.78|83.96|84.92|85.36|85.67|
|EffNetV2|71.55|55.59|31.10|18.87|12.41|9.27|81.51|85.83|86.79|87.22|87.56|
|EffNet-L2|78.54|57.37|31.88|19.90|13.55|9.87|83.93|88.56|89.66|90.15|90.56|
|EVA-02|78.54|57.75|32.49|19.80|13.53|9.97|84.82|89.51|90.62|91.12|91.56|

**Bounding box area analysis** is shown in Tab. 5. For each multilabel image, we evaluate model predictions against the label of the _i_ -th largest bounding box with a unique label, converting multilabel images into effectively single-label ones. The subset size for _i_ =1 equals 15951 (all M images); it drops to 15,668 for _i_ =2 because some images contain a single box annotated with multiple labels (see Fig. 6), leaving no second uniquely-labeled box. For higher _i_ the subsets shrink further simply because fewer images contain that many boxes. Accuracy falls sharply with box size – all models score 48–58% against the largest box, but only 8–10% for the fifth – confirming a strong saliency bias. However, the cumulative columns show that models do not ignore smaller objects entirely: the largest gain appears between ≤1 and ≤2, with continued but diminishing returns for deeper ranks, converging toward full M accuracy. The _Dom_ column evaluates against the union of labels on _dominant_ -flagged boxes per image (601 images). Unlike on M, where supervised models lead by a wide margin, _Dom_ accuracy is compressed into a narrow band for all model families (MLLMs: 73–78%, VLMs: 77–79%, supervised: 72–79%). MLLMs stay within 6 points of their M accuracy, whereas VLMs and supervised models fall 8–16 points below it. Given the small subset size (standard error of ~1.7 points), differences of a few points between individual models should not be over-interpreted. 

Table 6: Top-1 accuracy by number of unique ReGT labels per image. Each column _kn_ denotes a subset of _k_ -label images of size _n_ , with the last column grouping images with ≥6 labels. 

Table 7: Single-label compatible evaluation protocols defined in Sec. 5 and Suppl. Sec. C. Subscripts denote the number of images available for each protocol. 

|Model|1 label = S (n=32033)|2 labels (n=8769)|3 labels (n=3656)|4 labels (n=1842)|5 labels (n=911)|≥6 labels (n=773)|
|---|---|---|---|---|---|---|
|GPT-5.4|78.05|77.07|76.86|77.69|77.50|78.40|
|Qwen3-VL|76.24|78.79|79.79|79.70|77.72|81.89|
|Gemma 4|74.70|75.28|76.07|75.95|75.52|76.07|
|SigLIP|88.62|86.97|86.68|87.89|86.61|87.58|
|SigLIP2|89.22|87.64|86.87|88.00|87.49|86.68|
|SigLIP2-g|89.80|88.32|87.55|87.51|87.71|88.10|
|DINOv3|88.98|87.10|84.27|83.71|82.55|84.48|
|EffNetV2|88.84|88.01|86.71|87.19|88.04|86.68|
|EffNet-L2|90.79|90.72|90.45|90.72|89.90|89.65|
|EVA-02|91.59|91.65|91.17|91.80|91.44|91.85|

|Model|ReGT: S (n=32033)|ReGT: Dom′ (n=378)|ReGT: ExCrops (n=38439)|
|---|---|---|---|
|GPT-5.4|78.05|77.51|-|
|Qwen3-VL|76.24|70.11|-|
|Gemma 4|74.70|80.95|67.59|
|SigLIP|88.62|76.19|79.33|
|SigLIP2|89.22|79.10|79.94|
|SigLIP2-g|89.80|77.51|80.93|
|DINOv3|88.98|73.81|76.22|
|EffNetV2|88.84|66.40|78.48|
|EffNet-L2|90.79|76.72|78.89|
|EVA-02|91.59|77.51|79.41|

**Label count analysis** is presented in Tab. 6. Accuracy remains broadly stable as the number of ReGT labels per image increases (within ~2.5 points of the single-label S accuracy for most models, and within ~1 point for EVA-02 and EffNet-L2), contrary to the expectation that more labels would create a more target-rich environment. The exceptions are Qwen3-VL, which gains up to +5.7 points, and DINOv3, which drops by up to 6.4 points. Images with high label counts tend to depict complex scenes with many small objects, which offsets any advantage from having more valid prediction targets. 

**Single-label compatible protocols** are summarized in Tab. 7. We provide three evaluation protocols compatible with classical single-label ImageNet evaluation. _S_ is the standard ReGT single-label accuracy baseline. _Dom_<sup>_′_</sup> evaluates on multilabel images where all _dominant_ objects share the same label, counting a prediction correct if it matches that label. This is a stricter setting than in Tab. 5, where a prediction is correct if it matches the label of any object with the _dominant_ attribute. _ExCrops_ evaluates on non-overlapping expanded crops, each guaranteed to contain exactly one annotated object (see Sec. 5.2). _ExCrops_ results for GPT-5.4 and Qwen3-VL have been omitted due to computational resource constraints. 

# **D Comparison with Prior Reannotations** 

Table 8: Model accuracy evaluated against four prior reannotation datasets, each shown with original labels (top row per model) and with ReGT labels (bottom row). Subsets are defined relative to each dataset’s own annotations. All columns of both rows, including ImGT, are evaluated on the same images: images with no valid label in either the prior dataset or ReGT (N) are excluded. 

|Model|ImGT: A\N (n=45406)|ImageNet ReaL [2]: A\N (n=45406)|ImageNet ReaL [2]: S (n=38473)|ImageNet ReaL [2]: S+ (n=35222)|ImageNet ReaL [2]: S− (n=3251)|ImageNet ReaL [2]: M (n=6933)|ImageNet ReaL [2]: M+ (n=6046)|ImageNet ReaL [2]: M− (n=887)|
|---|---|---|---|---|---|---|---|---|
|GPT-5.4|74.23|78.47|79.90|83.69|38.91|70.52|74.43|43.86|
|GPT-5.4 ReGT|74.23|79.36|82.10|84.25|58.84|64.13|65.89|52.09|
|Qwen3-VL|72.59|77.06|77.53|81.25|37.19|74.46|78.55|46.56|
|Qwen3-VL ReGT|72.59|78.76|80.63|82.66|58.63|68.43|70.15|56.71|
|Gemma 4|71.18|75.56|76.70|80.17|39.19|69.19|72.92|43.74|
|Gemma 4 ReGT|71.18|76.57|78.97|81.01|56.91|63.23|64.85|52.20|
|EVA-02|91.99|91.97|92.65|98.35|30.91|88.16|95.53|37.88|
|EVA-02 ReGT|91.99|92.46|94.15|96.18|72.10|83.10|85.61|65.95|

|Model|ImGT: A\N (n=18920)|Multi-label annotations [40]: A\N (n=18920)|Multi-label annotations [40]: S (n=15629)|Multi-label annotations [40]: S+ (n=15267)|Multi-label annotations [40]: S− (n=362)|Multi-label annotations [40]: M (n=3291)|Multi-label annotations [40]: M+ (n=3229)|Multi-label annotations [40]: M− (n=62)|
|---|---|---|---|---|---|---|---|---|
|GPT-5.4|73.09|79.13|79.57|79.88|66.57|77.03|77.24|66.13|
|GPT-5.4 ReGT|73.09|78.02|80.10|80.50|63.26|68.13|68.26|61.29|
|Qwen3-VL|71.29|77.80|77.48|77.81|63.54|79.34|79.53|69.35|
|Qwen3-VL ReGT|71.29|77.35|78.81|79.16|63.81|70.43|70.52|66.13|
|Gemma 4|69.95|76.09|76.22|76.50|64.36|75.48|75.75|61.29|
|Gemma 4 ReGT|69.95|75.34|77.03|77.40|61.33|67.30|67.54|54.84|
|EVA-02|91.66|96.60|96.69|97.53|61.33|96.14|96.66|69.35|
|EVA-02 ReGT|91.66|91.89|94.06|94.65|69.34|81.56|81.91|62.90|

|Model|ImGT: A\N (n=9321)|ImageNetMultiLabel [45]: A\N (n=9321)|ImageNetMultiLabel [45]: S (n=7247)|ImageNetMultiLabel [45]: S+ (n=6040)|ImageNetMultiLabel [45]: S− (n=1207)|ImageNetMultiLabel [45]: M (n=2074)|ImageNetMultiLabel [45]: M+ (n=1923)|ImageNetMultiLabel [45]: M− (n=151)|
|---|---|---|---|---|---|---|---|---|
|GPT-5.4|73.16|75.06|74.31|83.26|29.49|77.68|80.60|40.40|
|GPT-5.4 ReGT|73.16|77.82|79.29|83.43|58.57|72.71|74.05|55.63|
|Qwen3-VL|71.71|75.24|73.08|82.02|28.33|82.79|85.13|52.98|
|Qwen3-VL ReGT|71.71|77.60|78.00|82.68|54.60|76.18|77.54|58.94|
|Gemma 4|70.31|73.03|71.89|80.25|30.07|77.00|80.19|36.42|
|Gemma 4 ReGT|70.31|75.14|76.07|80.35|54.68|71.89|73.43|52.32|
|EVA-02|91.91|85.62|84.01|97.53|16.32|91.27|96.41|25.83|
|EVA-02 ReGT|91.91|91.56|92.71|95.75|77.55|87.51|88.87|70.20|

|Model|ImGT: A\N (n=4296)|Label Errors [33]: A\N (n=4296)|Label Errors [33]: S (n=3753)|Label Errors [33]: S+ (n=2455)|Label Errors [33]: S− (n=1298)|Label Errors [33]: M (n=543)|Label Errors [33]: M+ (n=543)|Label Errors [33]: M− (n=0)|
|---|---|---|---|---|---|---|---|---|
|GPT-5.4|42.57|61.29|59.53|59.71|59.17|73.48|73.48|0.00|
|GPT-5.4 ReGT|42.57|66.13|65.55|65.66|65.33|70.17|70.17|0.00|
|Qwen3-VL|41.71|60.27|57.77|57.68|57.94|77.53|77.53|0.00|
|Qwen3-VL ReGT|41.71|66.22|65.09|65.54|64.25|74.03|74.03|0.00|
|Gemma 4|41.46|59.89|58.46|58.13|59.09|69.80|69.80|0.00|
|Gemma 4 ReGT|41.46|64.71|64.16|64.20|64.10|68.51|68.51|0.00|
|EVA-02|64.59|77.49|75.51|85.34|56.93|91.16|91.16|0.00|
|EVA-02 ReGT|64.59|81.03|80.42|85.62|70.57|85.27|85.27|0.00|

We evaluate models against four existing reannotation efforts and compare the effect of applying our image categories to each. Applying ReGT raises accuracy on the challenging S −subsets on most datasets, by 18–61 percentage points on ReaL [2] and ImageNetMultiLabel [45], indicating that prior datasets left a substantial number of label errors or missing labels unaddressed. In contrast, M+ accuracy drops for every model on every dataset (by 1–15 points), and S+ accuracy also decreases for some models, possibly reflecting cases where our stricter definitions remove labels that prior works accepted. Subset sizes in the table count only images with a valid label in both the prior dataset and ReGT ( _i.e._ N excluded). This lets us evaluate against the prior and ReGT labels on exactly the same images, so the table compares the annotations themselves under a tied setup. The multilabel 

Figure 16: Alluvial diagrams illustrating how proposed labels from prior ImageNet-1k reannotation efforts map to our ReGT labels. Each image is assigned to a category as defined in Fig. 4, and the flows reveal the degree of agreement and disagreement. 

rates in the main paper, in contrast, are relative to the original number of images of each effort (50,000, 20,000, 10,000 and 5,440 images, respectively). Direct comparison across datasets is not straightforward: the label distributions differ substantially ( _e.g._ S −ranges from 362 to 3,251 images, and Label Errors [33] contains no M −images at all). A label-flow analysis is provided in Fig. 16. 

# **NeurIPS Paper Checklist** 

1. **Claims** 

Question: Do the main claims made in the abstract and introduction accurately reflect the paper’s contributions and scope? 

Answer: [Yes] 

Justification: The introduction states four contributions: (i) a reannotated ImageNet-1k validation set with multilabel corrections, bounding boxes, revised class definitions, and semantic attributes; (ii) evaluation of model performance on the corrected labels with cropbased object-centric protocols; (iii) analysis of error propagation to derivative benchmarks; and (iv) a characterization of challenges in large-scale annotation with guidance on iterative human–MLLM collaboration. Limitations, including annotator cultural background, nonexpert status in fine-grained domains, and restriction to the validation set, are stated in the introduction and discussed in Secs. 4.4 and 6. 

Guidelines: 

   - The answer [N/A] means that the abstract and introduction do not include the claims made in the paper. 

   - The abstract and/or introduction should clearly state the claims made, including the contributions made in the paper and important assumptions and limitations. A [No] or [N/A] answer to this question will not be perceived well by the reviewers. 

   - The claims made should match theoretical and experimental results, and reflect how much the results can be expected to generalize to other settings. 

   - It is fine to include aspirational goals as motivation as long as it is clear that these goals are not attained by the paper. 

2. **Limitations** 

Question: Does the paper discuss the limitations of the work performed by the authors? Answer: [Yes] 

Justification: The limitations of the re-annotation are discussed in Secs. 4.4 and 6. Guidelines: 

- The answer [N/A] means that the paper has no limitation while the answer [No] means that the paper has limitations, but those are not discussed in the paper. 

- The authors are encouraged to create a separate “Limitations” section in their paper. 

- The paper should point out any strong assumptions and how robust the results are to violations of these assumptions (e.g., independence assumptions, noiseless settings, model well-specification, asymptotic approximations only holding locally). The authors should reflect on how these assumptions might be violated in practice and what the implications would be. 

- The authors should reflect on the scope of the claims made, e.g., if the approach was only tested on a few datasets or with a few runs. In general, empirical results often depend on implicit assumptions, which should be articulated. 

- The authors should reflect on the factors that influence the performance of the approach. For example, a facial recognition algorithm may perform poorly when image resolution is low or images are taken in low lighting. Or a speech-to-text system might not be used reliably to provide closed captions for online lectures because it fails to handle technical jargon. 

- The authors should discuss the computational efficiency of the proposed algorithms and how they scale with dataset size. 

- If applicable, the authors should discuss possible limitations of their approach to address problems of privacy and fairness. 

- While the authors might fear that complete honesty about limitations might be used by reviewers as grounds for rejection, a worse outcome might be that reviewers discover limitations that aren’t acknowledged in the paper. The authors should use their best judgment and recognize that individual actions in favor of transparency play an important role in developing norms that preserve the integrity of the community. Reviewers will be specifically instructed to not penalize honesty concerning limitations. 

## 3. **Theory assumptions and proofs** 

Question: For each theoretical result, does the paper provide the full set of assumptions and a complete (and correct) proof? 

Answer: [N/A] 

Justification: The paper does not include theoretical results. All numbered equations correspond to evaluation metrics rather than theorems. 

Guidelines: 

- The answer [N/A] means that the paper does not include theoretical results. 

- All the theorems, formulas, and proofs in the paper should be numbered and crossreferenced. 

- All assumptions should be clearly stated or referenced in the statement of any theorems. 

- The proofs can either appear in the main paper or the supplemental material, but if they appear in the supplemental material, the authors are encouraged to provide a short proof sketch to provide intuition. 

- Inversely, any informal proof provided in the core of the paper should be complemented by formal proofs provided in appendix or supplemental material. 

- Theorems and Lemmas that the proof relies upon should be properly referenced. 

## 4. **Experimental result reproducibility** 

Question: Does the paper fully disclose all the information needed to reproduce the main experimental results of the paper to the extent that it affects the main claims and/or conclusions of the paper (regardless of whether the code and data are provided or not)? 

Answer: [Yes] 

Justification: model and prompt specifications are given in Sec. B, and evaluation metrics and protocols in Secs. 5.1 and 5.2. Most evaluations use publicly available open-source models; closed-source models accessed via paid API were also used: GPT-4o (with SAM3 localizations) as an optional reference for annotators in the verification phase of the reannotation, and GPT-5.4 as one of the evaluated models in the benchmarking analysis, due to their superior performance. Outputs from these models are not exactly reproducible, and their availability and weights may change. Code and instructions are available in the public repository (see Item 5). The re-annotation involves human annotators and cannot be repeated under identical conditions; the discussion of subjective and challenging cases is itself a central contribution. We mitigated inter-annotator variance through careful objective guidelines, annotator training, and quality checks. The re-annotation is publicly previewable at `https://vrg.fel.cvut.cz/reimagenet` . 

Guidelines: 

- The answer [N/A] means that the paper does not include experiments. 

- If the paper includes experiments, a [No] answer to this question will not be perceived well by the reviewers: Making the paper reproducible is important, regardless of whether the code and data are provided or not. 

- If the contribution is a dataset and/or model, the authors should describe the steps taken to make their results reproducible or verifiable. 

- Depending on the contribution, reproducibility can be accomplished in various ways. For example, if the contribution is a novel architecture, describing the architecture fully might suffice, or if the contribution is a specific model and empirical evaluation, it may be necessary to either make it possible for others to replicate the model with the same dataset, or provide access to the model. In general. releasing code and data is often one good way to accomplish this, but reproducibility can also be provided via detailed instructions for how to replicate the results, access to a hosted model (e.g., in the case of a large language model), releasing of a model checkpoint, or other means that are appropriate to the research performed. 

- While NeurIPS does not require releasing code, the conference does require all submissions to provide some reasonable avenue for reproducibility, which may depend on the nature of the contribution. For example 

   - (a) If the contribution is primarily a new algorithm, the paper should make it clear how to reproduce that algorithm. 

   - (b) If the contribution is primarily a new model architecture, the paper should describe the architecture clearly and fully. 

   - (c) If the contribution is a new model (e.g., a large language model), then there should either be a way to access this model for reproducing the results or a way to reproduce the model (e.g., with an open-source dataset or instructions for how to construct the dataset). 

   - (d) We recognize that reproducibility may be tricky in some cases, in which case authors are welcome to describe the particular way they provide for reproducibility. In the case of closed-source models, it may be that access to the model is limited in some way (e.g., to registered users), but it should be possible for other researchers to have some path to reproducing or verifying the results. 

5. **Open access to data and code** 

Question: Does the paper provide open access to the data and code, with sufficient instructions to faithfully reproduce the main experimental results, as described in supplemental material? 

Answer: [Yes] 

Justification: The re-annotated dataset (the paper’s core contribution) is publicly available on Hugging Face ( `https://huggingface.co/datasets/vrg-prague/ReImageNet` ) with documentation and a Croissant metadata file, and evaluation metrics and experimental specifications are given in the main text and supplementary material. We do not propose a new method or release a new model; all evaluations use publicly available models, sometimes accessed via paid API. The public repository ( `https://github.com/klarajanouskova/ ImageNet` ) contains the code to load the annotations and compute the evaluation metrics reported in the paper, together with a README with instructions. Outputs of the closedsource models accessed via API are not exactly reproducible (see Item 4). 

Guidelines: 

   - The answer [N/A] means that paper does not include experiments requiring code. 

   - Please see the NeurIPS code and data submission guidelines ( `https://neurips.cc/ public/guides/CodeSubmissionPolicy` ) for more details. 

   - While we encourage the release of code and data, we understand that this might not be possible, so [No] is an acceptable answer. Papers cannot be rejected simply for not including code, unless this is central to the contribution (e.g., for a new open-source benchmark). 

   - The instructions should contain the exact command and environment needed to run to reproduce the results. See the NeurIPS code and data submission guidelines ( `https: //neurips.cc/public/guides/CodeSubmissionPolicy` ) for more details. 

   - The authors should provide instructions on data access and preparation, including how to access the raw data, preprocessed data, intermediate data, and generated data, etc. 

   - The authors should provide scripts to reproduce all experimental results for the new proposed method and baselines. If only a subset of experiments are reproducible, they should state which ones are omitted from the script and why. 

   - At submission time, to preserve anonymity, the authors should release anonymized versions (if applicable). 

   - Providing as much information as possible in supplemental material (appended to the paper) is recommended, but including URLs to data and code is permitted. 

6. **Experimental setting/details** 

Question: Does the paper specify all the training and test details (e.g., data splits, hyperparameters, how they were chosen, type of optimizer) necessary to understand the results? 

Answer: [Yes] 

Justification: The re-annotation is built on top of the official ImageNet-1k validation set. Additional evaluation splits are defined by attribute flags, labels, and bounding boxes in the annotation files. Model settings ( _e.g._ backbones, prompts used) are specified in Sec. B. 

Guidelines: 

   - The answer [N/A] means that the paper does not include experiments. 

   - The experimental setting should be presented in the core of the paper to a level of detail that is necessary to appreciate the results and make sense of them. 

   - The full details can be provided either with the code, in appendix, or as supplemental material. 

7. **Experiment statistical significance** 

Question: Does the paper report error bars suitably and correctly defined or other appropriate information about the statistical significance of the experiments? 

Answer: [No] 

Justification: We follow standard evaluation practices of the field. For most models, only a single checkpoint with deterministic inference is available. For non-deterministic models, multi-run statistics on the same data are reported by [19]. 

Guidelines: 

   - The answer [N/A] means that the paper does not include experiments. 

   - The authors should answer [Yes] if the results are accompanied by error bars, confidence intervals, or statistical significance tests, at least for the experiments that support the main claims of the paper. 

   - The factors of variability that the error bars are capturing should be clearly stated (for example, train/test split, initialization, random drawing of some parameter, or overall run with given experimental conditions). 

   - The method for calculating the error bars should be explained (closed form formula, call to a library function, bootstrap, etc.) 

   - The assumptions made should be given (e.g., Normally distributed errors). 

   - It should be clear whether the error bar is the standard deviation or the standard error of the mean. 

   - It is OK to report 1-sigma error bars, but one should state it. The authors should preferably report a 2-sigma error bar than state that they have a 96% CI, if the hypothesis of Normality of errors is not verified. 

   - For asymmetric distributions, the authors should be careful not to show in tables or figures symmetric error bars that would yield results that are out of range (e.g., negative error rates). 

   - If error bars are reported in tables or plots, the authors should explain in the text how they were calculated and reference the corresponding figures or tables in the text. 

8. **Experiments compute resources** 

Question: For each experiment, does the paper provide sufficient information on the computer resources (type of compute workers, memory, time of execution) needed to reproduce the experiments? 

Answer: [No] 

Justification: We report the hardware used for all on-premise experiments in Suppl. Sec. B, but do not report per-experiment resource usage. For closed-source models, such information is not publicly available. 

Guidelines: 

   - The answer [N/A] means that the paper does not include experiments. 

   - The paper should indicate the type of compute workers CPU or GPU, internal cluster, or cloud provider, including relevant memory and storage. 

   - The paper should provide the amount of compute required for each of the individual experimental runs as well as estimate the total compute. 

   - The paper should disclose whether the full research project required more compute than the experiments reported in the paper (e.g., preliminary or failed experiments that didn’t make it into the paper). 

9. **Code of ethics** 

Question: Does the research conducted in the paper conform, in every respect, with the NeurIPS Code of Ethics `https://neurips.cc/public/EthicsGuidelines` ? 

Answer: [Yes] 

Justification: The authors have reviewed the NeurIPS Code of Ethics. The work re-annotates an existing public benchmark; no new image data is collected or scraped. Re-annotation was performed by in-house annotators employed by the university under standard pay scales above minimum wage (see Item 14). The paper’s broader impacts and limitations, including inherited concerns from the underlying ImageNet dataset, are discussed in Sec. 4.4. 

Guidelines: 

- The answer [N/A] means that the authors have not reviewed the NeurIPS Code of Ethics. 

- If the authors answer [No], they should explain the special circumstances that require a deviation from the Code of Ethics. 

- The authors should make sure to preserve anonymity (e.g., if there is a special consideration due to laws or regulations in their jurisdiction). 

## 10. **Broader impacts** 

Question: Does the paper discuss both potential positive societal impacts and negative societal impacts of the work performed? 

Answer: [Yes] 

Justification: In Sec. 4.4, we also discuss broader impacts. On the positive side, more accurate ImageNet ground truth and a transferable methodology for estimating label noise enable better-calibrated claims about model performance and lower the cost of auditing widely-used benchmarks. On the negative side, we note that (i) our work inherits ImageNet’s known issues around problematic categories and image provenance, which re-annotation does not address; (ii) defining label quality via model ensemble agreement risks entrenching current architectures’ inductive biases as the implicit standard for annotatability; and (iii) a "cleaner" benchmark may produce unwarranted confidence in evaluation results that remain limited by distribution shift and construction validity. 

Guidelines: 

- The answer [N/A] means that there is no societal impact of the work performed. 

- If the authors answer [N/A] or [No], they should explain why their work has no societal impact or why the paper does not address societal impact. 

- Examples of negative societal impacts include potential malicious or unintended uses (e.g., disinformation, generating fake profiles, surveillance), fairness considerations (e.g., deployment of technologies that could make decisions that unfairly impact specific groups), privacy considerations, and security considerations. 

- The conference expects that many papers will be foundational research and not tied to particular applications, let alone deployments. However, if there is a direct path to any negative applications, the authors should point it out. For example, it is legitimate to point out that an improvement in the quality of generative models could be used to generate Deepfakes for disinformation. On the other hand, it is not needed to point out that a generic algorithm for optimizing neural networks could enable people to train models that generate Deepfakes faster. 

- The authors should consider possible harms that could arise when the technology is being used as intended and functioning correctly, harms that could arise when the technology is being used as intended but gives incorrect results, and harms following from (intentional or unintentional) misuse of the technology. 

- If there are negative societal impacts, the authors could also discuss possible mitigation strategies (e.g., gated release of models, providing defenses in addition to attacks, mechanisms for monitoring misuse, mechanisms to monitor how a system learns from feedback over time, improving the efficiency and accessibility of ML). 

## 11. **Safeguards** 

Question: Does the paper describe safeguards that have been put in place for responsible release of data or models that have a high risk for misuse (e.g., pre-trained language models, image generators, or scraped datasets)? 

## Answer: [N/A] 

Justification: The released asset consists of label re-annotations on top of the existing, publicly available ImageNet-1k validation set; we release no images, no scraped data, and no trained models. The re-annotations themselves do not introduce misuse vectors beyond those already present in ImageNet. 

Guidelines: 

- The answer [N/A] means that the paper poses no such risks. 

- Released models that have a high risk for misuse or dual-use should be released with necessary safeguards to allow for controlled use of the model, for example by requiring that users adhere to usage guidelines or restrictions to access the model or implementing safety filters. 

- Datasets that have been scraped from the Internet could pose safety risks. The authors should describe how they avoided releasing unsafe images. 

- We recognize that providing effective safeguards is challenging, and many papers do not require this, but we encourage authors to take this into account and make a best faith effort. 

## 12. **Licenses for existing assets** 

Question: Are the creators or original owners of assets (e.g., code, data, models), used in the paper, properly credited and are the license and terms of use explicitly mentioned and properly respected? 

Answer: [Yes] 

Justification: The ImageNet-1k validation set [39] is used under its standard non-commercial research terms of use ( `https://www.image-net.org/download.php` ). We use the standard ILSVRC2012 dataset version. All models evaluated in the paper are cited at the point of use, with model versions and access methods (open weights or API) specified in Sec. B. Derivative test sets we analyze are used under their respective released terms and properly cited. 

Guidelines: 

- The answer [N/A] means that the paper does not use existing assets. 

- The authors should cite the original paper that produced the code package or dataset. 

- The authors should state which version of the asset is used and, if possible, include a URL. 

- The name of the license (e.g., CC-BY 4.0) should be included for each asset. 

- For scraped data from a particular source (e.g., website), the copyright and terms of service of that source should be provided. 

- If assets are released, the license, copyright information, and terms of use in the package should be provided. For popular datasets, `paperswithcode.com/datasets` has curated licenses for some datasets. Their licensing guide can help determine the license of a dataset. 

- For existing datasets that are re-packaged, both the original license and the license of the derived asset (if it has changed) should be provided. 

- If this information is not available online, the authors are encouraged to reach out to the asset’s creators. 

## 13. **New assets** 

Question: Are new assets introduced in the paper well documented and is the documentation provided alongside the assets? 

Answer: [Yes] 

Justification: The paper introduces re-annotations of the ImageNet-1k validation set as a new asset. Annotation schema, attribute definitions, bounding-box conventions, and the reannotation protocol are documented in the paper (Secs. 3 and 4) and supplementary (Sec. A). The annotations are released on Hugging Face ( `https://huggingface.co/datasets/ vrg-prague/ReImageNet` ), where the dataset card documents the collection methodology, annotator instructions, attribute definitions, intended use, and known limitations, and an 

interactive preview is available at `https://vrg.fel.cvut.cz/reimagenet` . The annotation files are released under the CC-BY-4.0 license; we do not redistribute any images, which remain subject to the ImageNet terms of use. 

Guidelines: 

   - The answer [N/A] means that the paper does not release new assets. 

   - Researchers should communicate the details of the dataset/code/model as part of their submissions via structured templates. This includes details about training, license, limitations, etc. 

   - The paper should discuss whether and how consent was obtained from people whose asset is used. 

   - At submission time, remember to anonymize your assets (if applicable). You can either create an anonymized URL or include an anonymized zip file. 

14. **Crowdsourcing and research with human subjects** 

Question: For crowd-sourcing experiments and research with human subjects, does the paper include the full text of instructions given to participants and screenshots, if applicable, as well as details about compensation (if any)? 

Answer: [N/A] 

Justification: We do not conduct research with human subjects and do not use crowdsourcing platforms. The re-annotation was performed by in-house annotators employed by the university and paid according to the standard university pay scale, above the local minimum wage. Annotation guidelines and a description of the training and quality-control procedure are provided in Sec. 4 and Suppl. Sec. A. 

Guidelines: 

   - The answer [N/A] means that the paper does not involve crowdsourcing nor research with human subjects. 

   - Including this information in the supplemental material is fine, but if the main contribution of the paper involves human subjects, then as much detail as possible should be included in the main paper. 

   - According to the NeurIPS Code of Ethics, workers involved in data collection, curation, or other labor should be paid at least the minimum wage in the country of the data collector. 

15. **Institutional review board (IRB) approvals or equivalent for research with human subjects** 

Question: Does the paper describe potential risks incurred by study participants, whether such risks were disclosed to the subjects, and whether Institutional Review Board (IRB) approvals (or an equivalent approval/review based on the requirements of your country or institution) were obtained? 

Answer: [N/A] 

Justification: We do not conduct any research with human subjects, nor do we use any crowd-sourcing platforms. 

Guidelines: 

   - The answer [N/A] means that the paper does not involve crowdsourcing nor research with human subjects. 

   - Depending on the country in which research is conducted, IRB approval (or equivalent) may be required for any human subjects research. If you obtained IRB approval, you should clearly state this in the paper. 

   - We recognize that the procedures for this may vary significantly between institutions and locations, and we expect authors to adhere to the NeurIPS Code of Ethics and the guidelines for their institution. 

   - For initial submissions, do not include any information that would break anonymity (if applicable), such as the institution conducting the review. 

16. **Declaration of LLM usage** 

Question: Does the paper describe the usage of LLMs if it is an important, original, or non-standard component of the core methods in this research? Note that if the LLM is used only for writing, editing, or formatting purposes and does _not_ impact the core methodology, scientific rigor, or originality of the research, declaration is not required. 

Answer: [Yes] 

Justification: Large multimodal models (GPT-4o and GPT-5.4) are used as a core component of the methodology: as one of several signals during the re-annotation workflow, and as evaluated models in our benchmarking analysis. Their role, prompt specifications, and how their outputs were combined with human annotation decisions are described in Secs. B and 4. LLMs were also used incidentally for writing assistance; this latter use does not impact methodology or scientific rigor. 

Guidelines: 

- The answer [N/A] means that the core method development in this research does not involve LLMs as any important, original, or non-standard components. 

- Please refer to our LLM policy in the NeurIPS handbook for what should or should not be described. 

