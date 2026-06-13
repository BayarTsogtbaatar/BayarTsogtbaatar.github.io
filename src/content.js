export const PROFILE = {
  name: "Bayar T.",
  headline: "Cloud App Dev @ AWS | 9x AWS Certified",
  location: "Sacramento, California, United States",
  about: "I love solving problems.",
  organization: "Amazon Web Services (AWS)",
  education: "University of California, San Diego",
  topSkills: ["Hermes", "OpenClaw", "HuggingFace", "Amazon Web Services (AWS)"]
};

export const CONTACT_LINKS = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/bayar-t/" },
  { label: "GitHub", href: "https://github.com/bayar-t" },
  { label: "Hugging Face", href: "https://huggingface.co/bayarr" },
  { label: "Website", href: "https://bayartsogtbaatar.github.io/" },
  { label: "Repository", href: "https://github.com/BayarTsogtbaatar/BayarTsogtbaatar.github.io" }
];

export const sections = [
  {
    id: "experience",
    label: "Experience",
    preview: "AWS-scale systems, migration tooling, OpenSearch governance, and enterprise platforms.",
    items: [
      {
        title: "Cloud App Developer",
        org: "Amazon Web Services (AWS)",
        dates: "Dec 2025 - Present",
        meta: "Full-time - Remote",
        summary: [
          "Architected an externalized S3 Batch Operations manifest-planning pipeline for regional migrations, scaling planning to 1.5T rows per migration with AWS Glue, PySpark, S3, chunked Parquet reads, spill thresholds, worker tuning, batching, and memory flushing.",
          "Authored long-running migration workflows with parent-child patterns, SQS partial-batch failure handling, pause-workflow integration, live replication monitoring, severity-2 alarms, and control-plane workflow integration.",
          "Built a kiosk platform across 7 packages in under 4 months, including RBAC, device registration APIs, UI pages, Android WebView, Panther localization for English and Spanish, and accessibility compliance."
        ],
        tags: ["AWS Glue", "PySpark", "S3", "SQS", "React", "Kotlin", "CDK", "Cognito"]
      },
      {
        title: "Associate Cloud App Developer",
        org: "Amazon Web Services (AWS)",
        dates: "Nov 2022 - Nov 2025",
        meta: "Full-time - Remote",
        summary: [
          "Scaled jam.aws.com for AWS re:Invent 2023, including DAX caching that delivered 5x read throughput in DynamoDB and a Scheduled Jobs service for configurable cross-account scheduling.",
          "Created a reusable SAM, Glue, and Lambda migration framework that saved 200+ developer hours; replaced ORM DynamoDB access with OpenSearch queries to remove 66% of API calls.",
          "Moved API Gateway to OpenAPI specifications that mapped 4x more routes and reduced API-layer deployment time by 90%; helped migrate Spring Boot apps from Lambda to Fargate, reducing cloud costs by 70%.",
          "Built the initial Netty HTTP proxy foundation for OpenSearch governance adopted for production deployment, with customer-domain cost savings ranging from 20% to 90%.",
          "Led backend architecture for an M&E workflow pricing platform and built Skill Builder UI work with React, Cloudscape, GraphQL, supergraph, micro front ends, and TypeScript."
        ],
        tags: ["DynamoDB", "DAX", "OpenSearch", "SAM", "Lambda", "Fargate", "React", "TypeScript"]
      },
      {
        title: "Software Engineer",
        org: "Virtusa",
        dates: "Jan 2022 - Nov 2022",
        meta: "Contract to Fidelity Investments - Remote",
        summary: [
          "Modernized core applications, migrated on-prem services to Azure Kubernetes Service, supported dashboards, and contributed Db2 stored procedures on Mainframe.",
          "Worked across Spring MVC, Spring Boot, Tomcat, JUnit, Mockito, Cucumber, Jenkins, Docker, Kubernetes, Helm charts, UDeploy, Datadog, Splunk, Drools, and AKS."
        ],
        tags: ["Spring Boot", "AKS", "Docker", "Kubernetes", "Helm", "Db2", "Splunk"]
      },
      {
        title: "Software Engineer",
        org: "Early Warning",
        dates: "Oct 2020 - Nov 2021",
        meta: "Contract - Remote",
        summary: [
          "Worked on the Data Management platform for data quality and analysis, and led 2 developers through data-compliance efforts.",
          "Used Hive, Solr, HBase, Kafka, Hadoop, Spark, TestNG, Cucumber, JMeter, and Chef."
        ],
        tags: ["Kafka", "Hadoop", "Spark", "HBase", "JMeter", "Chef"]
      },
      {
        title: "Intern",
        org: "MOVA International (MOVA Globes)",
        dates: "Aug 2018 - Nov 2018",
        meta: "Part-time - San Diego, California",
        summary: ["Used CAD processes to engrave custom logos and messages on products."],
        tags: ["CAD", "Product customization"]
      }
    ]
  },
  {
    id: "projects",
    label: "Projects",
    preview: "Open-source infrastructure work, pathfinding visuals, and this singularity portfolio.",
    items: [
      {
        title: "OpenSearch Traffic Gateway",
        org: "Associated with Amazon Web Services (AWS)",
        dates: "Jan 2024 - Apr 2024",
        summary: [
          "Created the initial Netty-based HTTP proxy logic for intercepting OpenSearch traffic, aggregating chunked HTTP requests across frames, and evaluating complete requests against governance rules.",
          "Contributed bypass-key logic, rules engine work, Lucene query-string parsing, OpenSearch DateMathParser enforcement, a Helm chart, HPA autoscaling, and Kubernetes deployment support.",
          "The OpenSearch team open-sourced the code and used it in a workshop for 200+ developers; production rollout delivered 20-90% cost savings across customer domains."
        ],
        href: "https://github.com/opensearch-project/opensearch-traffic-gateway",
        tags: ["Netty", "OpenSearch", "Lucene", "Kubernetes", "Helm"]
      },
      {
        title: "A* Path Finding",
        org: "Personal project",
        dates: "Apr 2020 - Jul 2020",
        summary: ["Uses A* to find the shortest path through a grid and renders explored paths in real time."],
        tags: ["A*", "Pathfinding", "Visualization"]
      },
      {
        title: "Singularity Portfolio",
        org: "Personal site",
        dates: "2026",
        summary: ["A cinematic Three.js portfolio navigation system built around an interactive black-hole singularity."],
        tags: ["Three.js", "GSAP", "Vite", "WebGL"]
      }
    ]
  },
  {
    id: "skills",
    label: "Skills",
    preview: "Cloud systems, data platforms, web apps, testing, and 9x AWS certification depth.",
    groups: [
      { label: "Languages", values: ["Java", "C/C++", "Python", "HTML", "CSS", "JavaScript", "SQL", "ARM", "Haskell", "R"] },
      { label: "Cloud and Data", values: ["AWS", "Glue", "PySpark", "S3", "DynamoDB", "DAX", "OpenSearch", "Lambda", "SAM", "Fargate", "CDK", "Route53", "CloudAuth", "SigV4", "Cognito"] },
      { label: "Frontend and Apps", values: ["React", "Cloudscape", "GraphQL", "TypeScript", "Kotlin", "Android WebView", "Meridian", "Angular"] },
      { label: "Tools", values: ["Git", "GitLab", "Docker", "Gradle", "Postman", "Hermes", "OpenClaw", "HuggingFace"] },
      { label: "Testing and Quality", values: ["Veracode", "JMeter", "Gatling", "JUnit", "Mockito", "Cucumber", "TestNG"] },
      { label: "Communication", values: ["English"] }
    ],
    certifications: [
      "9x AWS Certified",
      "AWS Certified Generative AI Developer - Professional",
      "AWS Certified CloudOps Engineer - Associate",
      "AWS Certified Data Engineer - Associate",
      "AWS Certified Solutions Architect - Associate"
    ]
  },
  {
    id: "education",
    label: "Education",
    preview: "Mathematics - Computer Science foundation from UC San Diego.",
    items: [
      {
        title: "B.S., Mathematics - Computer Science",
        org: "UC San Diego",
        dates: "2015 - 2020",
        summary: ["Coursework and skill focus included functional programming and ARM."]
      },
      {
        title: "High School Diploma",
        org: "Inderkum High School",
        dates: "Aug 2011 - May 2015",
        summary: ["High school education."]
      }
    ]
  },
  {
    id: "contact",
    label: "Contact",
    preview: "LinkedIn, GitHub, Hugging Face, website, and source repository.",
    links: CONTACT_LINKS
  }
];

export const SECTION_IDS = sections.map((section) => section.id);

export function getSectionById(id) {
  const section = sections.find((candidate) => candidate.id === id);
  if (!section) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return section;
}
