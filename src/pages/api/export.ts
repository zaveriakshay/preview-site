import type { APIRoute } from 'astro';
import { Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, AlignmentType, HeadingLevel, ImageRun, InternalHyperlink, BookmarkEnd, BookmarkStart } from 'docx';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { loadApiSpec, loadAllApiSpecs } from '../../utils/openapi-loader';
import { getChangelogCoverNote } from '../../utils/changelog';
import { marked } from 'marked';

interface ExportRequest {
    format: 'pdf' | 'docx';
    lang: 'en' | 'ar';
    version: string;
    path: string;
    url: string;
    type?: 'guide' | 'api';
    platform?: 'web' | 'mobile';
}

interface DocumentSection {
    title: string;
    level: number;
    content: string;
    subsections?: DocumentSection[];
    pageNumber?: number;
    images?: string[];
}

interface DocumentData {
    title: string;
    type: 'API Specification' | 'Guide Documentation';
    version: string;
    language: string;
    sections: DocumentSection[];
    toc: TocItem[];
    isRTL: boolean;
    platform?: string;
}

interface TocItem {
    title: string;
    level: number;
    pageNumber: number;
    children?: TocItem[];
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json() as ExportRequest;
        const { format, lang, version, path: urlPath, type, platform } = body;
        
        const documentData = await collectDocumentContent(lang, version, urlPath, type, platform);
        
        if (format === 'pdf') {
            const pdfBuffer = await generatePDFWithJSPDF(documentData, lang, version);
            return new Response(pdfBuffer as BodyInit, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="noqodi-${documentData.type.toLowerCase().replace(' ', '-')}-${version}-${lang}.pdf"`
                }
            });
        } else if (format === 'docx') {
            const docxBuffer = await generateWordDocument(documentData, lang, version);
            return new Response(docxBuffer as BodyInit, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'Content-Disposition': `attachment; filename="noqodi-${documentData.type.toLowerCase().replace(' ', '-')}-${version}-${lang}.docx"`
                }
            });
        }
        
        return new Response('Invalid format', { status: 400 });
    } catch (error) {
        console.error('Export error:', error);
        return new Response('Export failed', { status: 500 });
    }
};

async function collectDocumentContent(
    lang: string,
    version: string,
    urlPath: string,
    type?: string,
    platform?: string
): Promise<DocumentData> {
    const isApi = urlPath.includes('/api/') || type === 'api';
    
    if (isApi) {
        return await collectApiSpecContent(lang, version, urlPath);
    } else {
        return await collectGuideContent(lang, version, platform || 'web');
    }
}

async function collectApiSpecContent(lang: string, version: string, urlPath?: string): Promise<DocumentData> {
    const apiSpecs = await loadAllApiSpecs();
    const relevantSpecs = apiSpecs.filter(spec => 
        spec.language === lang && spec.folderVersion === version
    );
    
    // Try to get changelog for API spec
    let changelogContent: string | null = null;
    if (urlPath) {
        // Extract module type from urlPath (e.g., "/api/payment-api" -> "payment-api")
        const pathParts = urlPath.split('/');
        const moduleType = pathParts[pathParts.length - 1] || 'unknown';
        changelogContent = await getChangelogCoverNote(lang, 'apispecs', moduleType, version);
    }
    
    const sections: DocumentSection[] = [];
    let pageNum = 3;
    
    // Add changelog as first section if available
    if (changelogContent) {
        sections.push({
            title: lang === 'ar' ? 'سجل التغييرات' : 'Change Log',
            level: 1,
            content: changelogContent,
            pageNumber: pageNum++
        });
    }
    
    for (const spec of relevantSpecs) {
        const section: DocumentSection = {
            title: spec.title,
            level: 1,
            content: spec.description,
            pageNumber: pageNum++,
            subsections: []
        };
        
        if (spec.spec.paths) {
            Object.entries(spec.spec.paths).forEach(([pathKey, pathItem]) => {
                if (!pathItem) return;
                
                const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
                methods.forEach(method => {
                    const operation = pathItem[method];
                    if (operation) {
                        section.subsections!.push({
                            title: `${method.toUpperCase()} ${pathKey}`,
                            level: 2,
                            content: `${operation.summary || ''}\n\n${operation.description || ''}`,
                            pageNumber: pageNum++
                        });
                    }
                });
            });
        }
        
        sections.push(section);
    }
    
    return {
        title: `${lang === 'ar' ? 'مواصفات واجهة برمجة التطبيقات' : 'API Specifications'} - ${version.toUpperCase()}`,
        type: 'API Specification',
        version,
        language: lang,
        sections,
        toc: generateTableOfContents(sections),
        isRTL: lang === 'ar'
    };
}

async function collectGuideContent(lang: string, version: string, platform: string): Promise<DocumentData> {
    const contentDir = path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', platform, version);
    
    // Try to get changelog for guide
    const changelogContent = await getChangelogCoverNote(lang, 'guides', platform, version);
    
    const sections: DocumentSection[] = [];
    let pageNum = 3;
    
    // Add changelog as first section if available
    if (changelogContent) {
        sections.push({
            title: lang === 'ar' ? 'سجل التغييرات' : 'Change Log',
            level: 1,
            content: changelogContent,
            pageNumber: pageNum++
        });
    }
    
    try {
        const categories = await fs.promises.readdir(contentDir, { withFileTypes: true });
        
        for (const category of categories.filter(d => d.isDirectory())) {
            const categoryPath = path.join(contentDir, category.name);
            const categorySection: DocumentSection = {
                title: formatCategoryTitle(category.name),
                level: 1,
                content: '',
                pageNumber: pageNum++,
                subsections: []
            };
            
            const files = await fs.promises.readdir(categoryPath);
            const mdFiles = files.filter(f => f.endsWith('.md')).sort();
            
            for (const file of mdFiles) {
                const filePath = path.join(categoryPath, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const { title, body, images } = parseMarkdownFile(content);
                
                categorySection.subsections!.push({
                    title: title || formatFileName(file),
                    level: 2,
                    content: body,
                    pageNumber: pageNum++,
                    images: images
                });
            }
            
            sections.push(categorySection);
        }
    } catch (error) {
        console.error('Error reading guide content:', error);
    }
    
    return {
        title: `${lang === 'ar' ? 'دليل المطور' : 'Developer Guide'} - ${platform.toUpperCase()} ${version.toUpperCase()}`,
        type: 'Guide Documentation',
        version,
        language: lang,
        sections,
        toc: generateTableOfContents(sections),
        isRTL: lang === 'ar',
        platform
    };
}

function parseMarkdownFile(content: string): { title: string; body: string; images: string[] } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let body = content;
    let title = '';
    
    if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        body = frontmatterMatch[2];
        const titleMatch = frontmatter.match(/title:\s*['"]?([^'"]+)['"]?/);
        title = titleMatch ? titleMatch[1] : '';
    }
    
    // Extract image references from markdown
    const images: string[] = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = imageRegex.exec(body)) !== null) {
        images.push(match[2]); // image path
    }
    
    return {
        title,
        body: body.trim(),
        images
    };
}

function formatCategoryTitle(categoryName: string): string {
    return categoryName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatFileName(fileName: string): string {
    return fileName
        .replace('.md', '')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function generateTableOfContents(sections: DocumentSection[]): TocItem[] {
    const toc: TocItem[] = [];
    
    sections.forEach(section => {
        const tocItem: TocItem = {
            title: section.title,
            level: section.level,
            pageNumber: section.pageNumber || 1,
            children: []
        };
        
        if (section.subsections) {
            section.subsections.forEach(sub => {
                tocItem.children!.push({
                    title: sub.title,
                    level: sub.level,
                    pageNumber: sub.pageNumber || 1
                });
            });
        }
        
        toc.push(tocItem);
    });
    
    return toc;
}

function processImageForPDF(imagePath: string, section: DocumentSection, subsection: DocumentSection, documentData: DocumentData): string | null {
    try {
        // Handle relative image paths based on markdown file structure
        let fullImagePath: string;
        
        if (imagePath.startsWith('./') || imagePath.startsWith('../')) {
            // Images are relative to the markdown file location
            // Structure: src/content/docs/{lang}/guides/{platform}/{version}/{category}/img/
            const lang = documentData.language;
            const isGuide = documentData.type === 'Guide Documentation';
            
            if (isGuide && documentData.platform) {
                // For guides, we know the exact platform and version
                const platform = documentData.platform;
                const version = documentData.version;
                const categoryFolder = section.title.toLowerCase().replace(/\s+/g, '-');
                
                // Construct the exact path based on known structure
                const exactPath = path.join(
                    process.cwd(), 
                    'src', 'content', 'docs', 
                    lang, 'guides', platform, version, 
                    categoryFolder, 
                    imagePath
                );
                
                console.log(`Looking for image: ${imagePath}`);
                console.log(`Trying exact path: ${exactPath}`);
                console.log(`Path exists: ${fs.existsSync(exactPath)}`);
                
                if (fs.existsSync(exactPath)) {
                    fullImagePath = exactPath;
                    console.log(`Found image at: ${fullImagePath}`);
                } else {
                    // Fallback: try other combinations in case the structure is different
                    const possiblePaths = [
                        exactPath,
                        // Try other platform/version combinations as fallback
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'mobile', 'v1', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'mobile', 'v2', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'web', 'v1', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'web', 'v2', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'web', 'v3', categoryFolder, imagePath),
                        // Generic fallback paths
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, imagePath),
                        path.join(process.cwd(), 'public', imagePath)
                    ];
                    
                    fullImagePath = possiblePaths.find(p => {
                        const exists = fs.existsSync(p);
                        if (exists) {
                            console.log(`Found image at fallback path: ${p}`);
                        }
                        return exists;
                    }) || exactPath;
                    
                    if (!fs.existsSync(fullImagePath)) {
                        console.warn(`Image not found after trying all paths: ${imagePath}`);
                        console.warn(`Final attempted path: ${fullImagePath}`);
                    }
                }
            } else {
                // For API specs, try different locations
                const possiblePaths = [
                    path.join(process.cwd(), 'src', 'content', 'docs', lang, imagePath),
                    path.join(process.cwd(), 'public', imagePath)
                ];
                
                fullImagePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
            }
        } else if (imagePath.startsWith('/')) {
            // Absolute path from public directory
            fullImagePath = path.join(process.cwd(), 'public', imagePath);
        } else {
            // Relative to content directory
            const lang = documentData.language;
            fullImagePath = path.join(process.cwd(), 'src', 'content', 'docs', lang, imagePath);
        }
        
        // Check if file exists
        if (!fs.existsSync(fullImagePath)) {
            console.warn(`Image not found: ${fullImagePath}`);
            return null;
        }
        
        // Read image and convert to base64
        const imageBuffer = fs.readFileSync(fullImagePath);
        const ext = path.extname(fullImagePath).toLowerCase();
        
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') {
            mimeType = 'image/jpeg';
        } else if (ext === '.gif') {
            mimeType = 'image/gif';
        }
        
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
        console.error(`Error processing image ${imagePath}:`, error);
        return null;
    }
}

function processImageForWord(imagePath: string, section: DocumentSection, subsection: DocumentSection, documentData: DocumentData): Buffer | null {
    try {
        // Handle relative image paths based on markdown file structure
        let fullImagePath: string;
        
        if (imagePath.startsWith('./') || imagePath.startsWith('../')) {
            // Images are relative to the markdown file location
            // Structure: src/content/docs/{lang}/guides/{platform}/{version}/{category}/img/
            const lang = documentData.language;
            const isGuide = documentData.type === 'Guide Documentation';
            
            if (isGuide && documentData.platform) {
                // For guides, we know the exact platform and version
                const platform = documentData.platform;
                const version = documentData.version;
                const categoryFolder = section.title.toLowerCase().replace(/\s+/g, '-');
                
                // Construct the exact path based on known structure
                const exactPath = path.join(
                    process.cwd(), 
                    'src', 'content', 'docs', 
                    lang, 'guides', platform, version, 
                    categoryFolder, 
                    imagePath
                );
                
                console.log(`Looking for image: ${imagePath}`);
                console.log(`Trying exact path: ${exactPath}`);
                console.log(`Path exists: ${fs.existsSync(exactPath)}`);
                
                if (fs.existsSync(exactPath)) {
                    fullImagePath = exactPath;
                    console.log(`Found image at: ${fullImagePath}`);
                } else {
                    // Fallback: try other combinations in case the structure is different
                    const possiblePaths = [
                        exactPath,
                        // Try other platform/version combinations as fallback
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'mobile', 'v1', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'mobile', 'v2', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'web', 'v1', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'web', 'v2', categoryFolder, imagePath),
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, 'guides', 'web', 'v3', categoryFolder, imagePath),
                        // Generic fallback paths
                        path.join(process.cwd(), 'src', 'content', 'docs', lang, imagePath),
                        path.join(process.cwd(), 'public', imagePath)
                    ];
                    
                    fullImagePath = possiblePaths.find(p => {
                        const exists = fs.existsSync(p);
                        if (exists) {
                            console.log(`Found image at fallback path: ${p}`);
                        }
                        return exists;
                    }) || exactPath;
                    
                    if (!fs.existsSync(fullImagePath)) {
                        console.warn(`Image not found after trying all paths: ${imagePath}`);
                        console.warn(`Final attempted path: ${fullImagePath}`);
                    }
                }
            } else {
                // For API specs, try different locations
                const possiblePaths = [
                    path.join(process.cwd(), 'src', 'content', 'docs', lang, imagePath),
                    path.join(process.cwd(), 'public', imagePath)
                ];
                
                fullImagePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
            }
        } else if (imagePath.startsWith('/')) {
            fullImagePath = path.join(process.cwd(), 'public', imagePath);
        } else {
            // Relative to content directory
            const lang = documentData.language;
            fullImagePath = path.join(process.cwd(), 'src', 'content', 'docs', lang, imagePath);
        }
        
        if (!fs.existsSync(fullImagePath)) {
            console.warn(`Image not found: ${fullImagePath}`);
            return null;
        }
        
        return fs.readFileSync(fullImagePath);
    } catch (error) {
        console.error(`Error processing image ${imagePath}:`, error);
        return null;
    }
}

async function generatePDFWithJSPDF(documentData: DocumentData, lang: string, version: string): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');
    const isRTL = lang === 'ar';
    
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    let yPosition = 40;
    const pageHeight = 297;
    const pageWidth = 210;
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    
    const addHeader = () => {
        doc.setFontSize(9);
        doc.setTextColor(102, 102, 102);
        doc.text('noqodi', margin, 15);
        doc.text(`FINAL VERSION ${version}`, pageWidth - margin, 15, { align: 'right' });
        doc.text('FOR INTERNAL USE', pageWidth - margin, 10, { align: 'right' });
        
        doc.setLineWidth(0.5);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 20, pageWidth - margin, 20);
    };
    
    const addFooter = (pageNum: number) => {
        doc.setFontSize(9);
        doc.setTextColor(102, 102, 102);
        doc.text(documentData.title, margin, pageHeight - 15);
        doc.text(`${pageNum}`, pageWidth - margin, pageHeight - 15, { align: 'right' });
        
        doc.setLineWidth(0.5);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
    };
    
    const checkPageBreak = (requiredSpace: number = 20) => {
        if (yPosition + requiredSpace > pageHeight - 40) {
            addFooter((doc as any).internal.getNumberOfPages());
            doc.addPage();
            addHeader();
            yPosition = 40;
        }
    };
    
    // Generate cover page based on the screenshot structure
    generateCoverPage(doc, documentData, version, isRTL, pageWidth, margin);
    
    // Add changelog cover note if available
    const hasChangelog = documentData.sections.length > 0 && 
        (documentData.sections[0].title === 'Change Log' || documentData.sections[0].title === 'سجل التغييرات');
    
    if (hasChangelog) {
        doc.addPage();
        addHeader();
        yPosition = 40;
        
        // Changelog title
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(documentData.sections[0].title, margin, yPosition);
        yPosition += 20;
        
        // Parse markdown to HTML
        const changelogHtml = marked.parse(documentData.sections[0].content);
        const dom = new JSDOM(changelogHtml);
        const document = dom.window.document;
        
        // Process HTML elements for PDF
        const elements = document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, table, strong, em');
        
        elements.forEach(element => {
            if (element.tagName.match(/^H[1-6]$/)) {
                // Headers
                checkPageBreak(15);
                const level = parseInt(element.tagName.substring(1));
                doc.setFontSize(20 - (level * 2));
                doc.setFont('helvetica', 'bold');
                doc.text(element.textContent || '', margin, yPosition);
                yPosition += 10;
                doc.setFont('helvetica', 'normal');
            } else if (element.tagName === 'P') {
                // Paragraphs
                const text = element.textContent?.trim();
                if (text) {
                    checkPageBreak();
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'normal');
                    const lines = doc.splitTextToSize(text, maxWidth);
                    lines.forEach((line: string) => {
                        checkPageBreak();
                        doc.text(line, margin, yPosition);
                        yPosition += 6;
                    });
                    yPosition += 4;
                }
            } else if (element.tagName === 'UL' || element.tagName === 'OL') {
                // Lists
                const listItems = element.querySelectorAll('li');
                listItems.forEach((li, index) => {
                    checkPageBreak();
                    const bullet = element.tagName === 'OL' ? `${index + 1}. ` : '• ';
                    const itemText = li.textContent?.trim() || '';
                    doc.setFontSize(11);
                    doc.text(bullet, margin + 5, yPosition);
                    const lines = doc.splitTextToSize(itemText, maxWidth - 15);
                    lines.forEach((line: string, lineIndex: number) => {
                        checkPageBreak();
                        doc.text(line, margin + 15, yPosition);
                        if (lineIndex < lines.length - 1) {
                            yPosition += 6;
                        }
                    });
                    yPosition += 8;
                });
            } else if (element.tagName === 'TABLE') {
                // Simple table rendering
                checkPageBreak(20);
                doc.setFontSize(10);
                const rows = element.querySelectorAll('tr');
                rows.forEach((row, rowIndex) => {
                    const cells = row.querySelectorAll('td, th');
                    let cellX = margin;
                    const cellWidth = maxWidth / cells.length;
                    
                    cells.forEach(cell => {
                        const text = cell.textContent?.trim() || '';
                        if (row.querySelector('th')) {
                            doc.setFont('helvetica', 'bold');
                        } else {
                            doc.setFont('helvetica', 'normal');
                        }
                        
                        const lines = doc.splitTextToSize(text, cellWidth - 5);
                        lines.forEach((line: string, lineIndex: number) => {
                            doc.text(line, cellX, yPosition + (lineIndex * 5));
                        });
                        cellX += cellWidth;
                    });
                    
                    yPosition += Math.max(8, cells.length * 5);
                    checkPageBreak();
                });
                yPosition += 5;
            }
        });
    }
    
    // Add table of contents page
    doc.addPage();
    addHeader();
    yPosition = 40;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    const tocTitle = lang === 'ar' ? 'جدول المحتويات' : 'Table of Contents';
    doc.text(tocTitle, margin, yPosition);
    yPosition += 20;
    
    // Generate TOC with dotted lines and page numbers
    // Skip changelog in TOC if it's already been shown
    const tocToShow = hasChangelog ? documentData.toc.slice(1) : documentData.toc;
    
    tocToShow.forEach((item: TocItem) => {
        checkPageBreak();
        
        doc.setFontSize(12);
        doc.setFont('helvetica', item.level === 1 ? 'bold' : 'normal');
        
        const indent = (item.level - 1) * 10;
        const titleX = margin + indent;
        const pageNumX = pageWidth - margin - 20;
        const dotWidth = pageNumX - titleX - doc.getTextWidth(item.title) - 10;
        
        // Title
        doc.text(item.title, titleX, yPosition);
        
        // Title with internal link
        doc.setTextColor(0, 0, 255);
        doc.text(item.title, titleX, yPosition);
        doc.link(titleX, yPosition - 3, doc.getTextWidth(item.title), 5, { pageNumber: item.pageNumber });
        doc.setTextColor(0, 0, 0);
        
        // Dotted line
        if (dotWidth > 0) {
            const dots = '.'.repeat(Math.floor(dotWidth / 2));
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(dots, titleX + doc.getTextWidth(item.title) + 5, yPosition);
        }
        
        // Page number with link
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 255);
        doc.text(item.pageNumber.toString(), pageNumX, yPosition, { align: 'right' });
        doc.link(pageNumX - 20, yPosition - 3, 20, 5, { pageNumber: item.pageNumber });
        doc.setTextColor(0, 0, 0);
        
        yPosition += 8;
        
        // Add children
        if (item.children) {
            item.children.forEach((child: TocItem) => {
                checkPageBreak();
                
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                
                const childIndent = (child.level) * 10;
                const childTitleX = margin + childIndent;
                const childPageNumX = pageWidth - margin - 20;
                const childDotWidth = childPageNumX - childTitleX - doc.getTextWidth(child.title) - 10;
                
                // Child title with internal link
                doc.setTextColor(0, 0, 255);
                doc.text(child.title, childTitleX, yPosition);
                doc.link(childTitleX, yPosition - 3, doc.getTextWidth(child.title), 4, { pageNumber: child.pageNumber });
                doc.setTextColor(0, 0, 0);
                
                if (childDotWidth > 0) {
                    const childDots = '.'.repeat(Math.floor(childDotWidth / 2));
                    doc.text(childDots, childTitleX + doc.getTextWidth(child.title) + 5, yPosition);
                }
                
                doc.setTextColor(0, 0, 255);
                doc.text(child.pageNumber.toString(), childPageNumX, yPosition, { align: 'right' });
                doc.link(childPageNumX - 20, yPosition - 3, 20, 4, { pageNumber: child.pageNumber });
                doc.setTextColor(0, 0, 0);
                yPosition += 6;
            });
        }
    });
    
    // Add content pages
    documentData.sections.forEach((section: DocumentSection, sectionIndex: number) => {
        // Skip changelog section as it's already been displayed
        if (hasChangelog && sectionIndex === 0) {
            return;
        }
        doc.addPage();
        addHeader();
        yPosition = 40;
        
        // Section title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(section.title, margin, yPosition);
        yPosition += 15;
        
        // Section content
        if (section.content) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(section.content, maxWidth);
            
            lines.forEach((line: string) => {
                checkPageBreak();
                doc.text(line, margin, yPosition);
                yPosition += 6;
            });
            yPosition += 10;
        }
        
        // Subsections
        if (section.subsections) {
            section.subsections.forEach((subsection: DocumentSection) => {
                checkPageBreak(20);
                
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(subsection.title, margin, yPosition);
                yPosition += 10;
                
                if (subsection.content) {
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'normal');
                    const subLines = doc.splitTextToSize(subsection.content, maxWidth);
                    
                    subLines.forEach((line: string) => {
                        checkPageBreak();
                        doc.text(line, margin, yPosition);
                        yPosition += 6;
                    });
                    yPosition += 10;
                }
                
                // Add images if any
                if (subsection.images && subsection.images.length > 0) {
                    for (const imagePath of subsection.images) {
                        try {
                            // We need to pass the current section context to find the correct image path
                            const imageData = processImageForPDF(imagePath, section, subsection, documentData);
                            
                            if (imageData) {
                                checkPageBreak(80); // Reserve space for image
                                
                                // Add image to PDF
                                const imgWidth = Math.min(maxWidth, 120);
                                const imgHeight = 80; // Fixed height, or calculate aspect ratio
                                
                                // Determine image format from data URI
                                let imageFormat = 'PNG';
                                if (imageData.includes('data:image/jpeg') || imageData.includes('data:image/jpg')) {
                                    imageFormat = 'JPEG';
                                } else if (imageData.includes('data:image/gif')) {
                                    imageFormat = 'GIF';
                                }
                                
                                doc.addImage(imageData, imageFormat, margin, yPosition, imgWidth, imgHeight);
                                yPosition += imgHeight + 10;
                            }
                        } catch (error) {
                            console.error(`Error adding image to PDF: ${imagePath}`, error);
                        }
                    }
                }
            });
        }
    });
    
    // Add page numbers to all pages
    for (let i = 1; i <= (doc as any).internal.getNumberOfPages(); i++) {
        doc.setPage(i);
        if (i > 1) {
            addFooter(i);
        }
    }
    
    return Buffer.from(doc.output('arraybuffer'));
}

function generateCoverPage(doc: any, documentData: DocumentData, version: string, isRTL: boolean, pageWidth: number, margin: number) {
    // Header with version and internal use notice
    doc.setFontSize(10);
    doc.setTextColor(102, 102, 102);
    doc.text(`FINAL VERSION ${version}`, margin, 25);
    doc.text('FOR INTERNAL USE', pageWidth - margin, 25, { align: 'right' });
    
    // Noqodi logo placeholder (centered)
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(67, 142, 185);
    doc.text('noqodi', pageWidth / 2, 50, { align: 'center' });
    
    // Document Information Table
    let tableY = 80;
    const tableHeight = 120;
    const tableWidth = pageWidth - (margin * 2);
    
    // Table header
    doc.setFillColor(67, 142, 185);
    doc.rect(margin, tableY, tableWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Document Information', margin + 5, tableY + 10);
    
    tableY += 15;
    
    // Table rows
    const rows = [
        ['Document Title', documentData.title],
        ['Document Type', documentData.type],
        ['Document Owner', 'NOQODI'],
        ['Version', version],
        ['Date', new Date().toLocaleDateString()],
        ['Review Schedule', 'Yearly']
    ];
    
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    rows.forEach((row, index) => {
        const rowY = tableY + (index * 15);
        
        // Alternating row colors
        if (index % 2 === 0) {
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, rowY, tableWidth, 15, 'F');
        }
        
        // Draw borders
        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, rowY, tableWidth / 3, 15);
        doc.rect(margin + tableWidth / 3, rowY, (tableWidth * 2) / 3, 15);
        
        // Add text
        doc.setFont('helvetica', 'bold');
        doc.text(row[0], margin + 5, rowY + 10);
        doc.setFont('helvetica', 'normal');
        doc.text(row[1], margin + tableWidth / 3 + 5, rowY + 10);
    });
    
    // Document History Table
    tableY += rows.length * 15 + 20;
    
    doc.setFillColor(67, 142, 185);
    doc.rect(margin, tableY, tableWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Document History', margin + 5, tableY + 10);
    
    tableY += 15;
    
    // History headers
    const historyHeaders = ['Date', 'Version', 'Name', 'Description'];
    const colWidths = [tableWidth * 0.2, tableWidth * 0.15, tableWidth * 0.25, tableWidth * 0.4];
    
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, tableY, tableWidth, 15, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    
    let colX = margin;
    historyHeaders.forEach((header, index) => {
        doc.text(header, colX + 5, tableY + 10);
        colX += colWidths[index];
    });
    
    tableY += 15;
    
    // Sample history entry
    const historyData = [
        [new Date().toLocaleDateString(), version, 'System', 'Generated documentation']
    ];
    
    historyData.forEach((row, index) => {
        const rowY = tableY + (index * 15);
        
        doc.setDrawColor(200, 200, 200);
        let cellX = margin;
        
        row.forEach((cell, cellIndex) => {
            doc.rect(cellX, rowY, colWidths[cellIndex], 15);
            doc.setFont('helvetica', 'normal');
            doc.text(cell, cellX + 5, rowY + 10);
            cellX += colWidths[cellIndex];
        });
    });
    
    // Approvals table
    tableY += historyData.length * 15 + 20;
    
    doc.setFillColor(67, 142, 185);
    doc.rect(margin, tableY, tableWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Approvals (This document requires the following approvals)', margin + 5, tableY + 10);
    
    tableY += 15;
    
    // Approval headers
    const approvalHeaders = ['Name', 'Title', 'Mode of Approval', 'Date of Approval'];
    
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, tableY, tableWidth, 15, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    
    colX = margin;
    approvalHeaders.forEach((header) => {
        doc.text(header, colX + 5, tableY + 10);
        colX += tableWidth / 4;
    });
}

async function generateWordDocument(documentData: DocumentData, lang: string, version: string): Promise<Buffer> {
    const isRTL = lang === 'ar';
    
    // Create content sections
    const contentChildren = generateWordContent(documentData.sections, lang);
    
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440,
                        right: 1440,
                        bottom: 1440,
                        left: 1440
                    }
                }
            },
            headers: {
                default: new Header({
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `noqodi - ${documentData.title} - Version ${version}`,
                                    size: 18,
                                    color: "666666"
                                })
                            ],
                            alignment: AlignmentType.CENTER
                        })
                    ]
                })
            },
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: documentData.title,
                                    size: 18,
                                    color: "666666"
                                }),
                                new TextRun({
                                    text: " - Page ",
                                    size: 18,
                                    color: "666666"
                                }),
                                PageNumber.CURRENT
                            ],
                            alignment: AlignmentType.CENTER
                        })
                    ]
                })
            },
            children: [
                // Cover page
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "noqodi",
                            size: 48,
                            bold: true,
                            color: "438EB9"
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 }
                }),
                // Add changelog cover note section if available
                ...(documentData.sections.length > 0 && 
                   (documentData.sections[0].title === 'Change Log' || documentData.sections[0].title === 'سجل التغييرات')
                   ? [
                       new Paragraph({
                           children: [new TextRun("")],
                           pageBreakBefore: true
                       }),
                       new Paragraph({
                           children: [
                               new TextRun({
                                   text: documentData.sections[0].title,
                                   size: 36,
                                   bold: true
                               })
                           ],
                           heading: HeadingLevel.HEADING_1,
                           spacing: { after: 400 }
                       }),
                       ...(() => {
                           // Parse markdown to HTML
                           const changelogHtml = marked.parse(documentData.sections[0].content);
                           const dom = new JSDOM(changelogHtml);
                           const document = dom.window.document;
                           
                           const paragraphs: Paragraph[] = [];
                           
                           // Process all elements in the changelog
                           const elements = document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, table');
                           
                           elements.forEach(element => {
                               if (element.tagName.match(/^H[1-6]$/)) {
                                   // Headers
                                   const level = parseInt(element.tagName.substring(1));
                                   paragraphs.push(
                                       new Paragraph({
                                           children: [
                                               new TextRun({
                                                   text: element.textContent || '',
                                                   size: 32 - (level * 2),
                                                   bold: true
                                               })
                                           ],
                                           heading: level === 1 ? HeadingLevel.HEADING_1 :
                                                   level === 2 ? HeadingLevel.HEADING_2 :
                                                   HeadingLevel.HEADING_3,
                                           spacing: { before: 200, after: 100 }
                                       })
                                   );
                               } else if (element.tagName === 'P') {
                                   // Regular paragraphs
                                   const text = element.textContent?.trim();
                                   if (text) {
                                       paragraphs.push(
                                           new Paragraph({
                                               children: [
                                                   new TextRun({
                                                       text: text,
                                                       size: 22
                                                   })
                                               ],
                                               spacing: { after: 120 }
                                           })
                                       );
                                   }
                               } else if (element.tagName === 'UL' || element.tagName === 'OL') {
                                   // Lists
                                   const listItems = element.querySelectorAll('li');
                                   listItems.forEach((li, index) => {
                                       const bullet = element.tagName === 'OL' ? `${index + 1}. ` : '• ';
                                       paragraphs.push(
                                           new Paragraph({
                                               children: [
                                                   new TextRun({
                                                       text: bullet + (li.textContent?.trim() || ''),
                                                       size: 22
                                                   })
                                               ],
                                               indent: { left: 720 },
                                               spacing: { after: 80 }
                                           })
                                       );
                                   });
                               } else if (element.tagName === 'TABLE') {
                                   // Simple table representation
                                   const rows = element.querySelectorAll('tr');
                                   rows.forEach(row => {
                                       const cells = row.querySelectorAll('td, th');
                                       const rowText = Array.from(cells).map(cell => cell.textContent?.trim() || '').join(' | ');
                                       if (rowText) {
                                           paragraphs.push(
                                               new Paragraph({
                                                   children: [
                                                       new TextRun({
                                                           text: rowText,
                                                           size: 20,
                                                           bold: row.querySelector('th') !== null
                                                       })
                                                   ],
                                                   spacing: { after: 60 }
                                               })
                                           );
                                       }
                                   });
                               }
                           });
                           
                           return paragraphs;
                       })()
                   ] : []),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: documentData.title,
                            size: 32,
                            bold: true
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 }
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `Version ${version}`,
                            size: 24
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: new Date().toLocaleDateString(),
                            size: 20
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 800 }
                }),
                new Paragraph({
                    children: [new TextRun("")],
                    pageBreakBefore: true
                }),
                // Table of Contents
                new Paragraph({
                    children: [
                        new TextRun({
                            text: lang === 'ar' ? 'جدول المحتويات' : 'Table of Contents',
                            size: 36,
                            bold: true
                        })
                    ],
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 400 }
                }),
                ...generateSimpleWordTOC(hasChangelog ? documentData.toc.slice(1) : documentData.toc),
                new Paragraph({
                    children: [new TextRun("")],
                    pageBreakBefore: true
                }),
                // Content
                ...contentChildren
            ]
        }]
    });
    
    return await Packer.toBuffer(doc);
}

function generateSimpleWordTOC(toc: TocItem[]): Paragraph[] {
    const children: Paragraph[] = [];
    
    toc.forEach((item: TocItem, index: number) => {
        const indent = (item.level - 1) * 720;
        const bookmarkId = `toc_${index}_${item.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        children.push(
            new Paragraph({
                children: [
                    new InternalHyperlink({
                        anchor: bookmarkId,
                        children: [
                            new TextRun({
                                text: `${item.title}`,
                                size: 24 - (item.level * 2),
                                bold: item.level === 1,
                                color: "0000FF",
                                underline: {}
                            })
                        ]
                    }),
                    new TextRun({
                        text: ` .................. ${item.pageNumber}`,
                        size: 20,
                        color: "666666"
                    })
                ],
                indent: { left: indent },
                spacing: { after: 120 }
            })
        );
        
        if (item.children) {
            item.children.forEach((child: TocItem, childIndex: number) => {
                const childIndent = child.level * 720;
                const childBookmarkId = `toc_${index}_${childIndex}_${child.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                children.push(
                    new Paragraph({
                        children: [
                            new InternalHyperlink({
                                anchor: childBookmarkId,
                                children: [
                                    new TextRun({
                                        text: `${child.title}`,
                                        size: 20,
                                        bold: false,
                                        color: "0000FF",
                                        underline: {}
                                    })
                                ]
                            }),
                            new TextRun({
                                text: ` .................. ${child.pageNumber}`,
                                size: 18,
                                color: "666666"
                            })
                        ],
                        indent: { left: childIndent },
                        spacing: { after: 80 }
                    })
                );
            });
        }
    });
    
    return children;
}


function generateWordContent(sections: DocumentSection[], lang: string): Paragraph[] {
    const children: Paragraph[] = [];
    
    // Check if first section is changelog and skip it (already shown before TOC)
    const hasChangelog = sections.length > 0 && 
        (sections[0].title === 'Change Log' || sections[0].title === 'سجل التغييرات');
    
    const sectionsToProcess = hasChangelog ? sections.slice(1) : sections;
    
    for (const [sectionIndex, section] of sectionsToProcess.entries()) {
        const sectionBookmarkId = `toc_${sectionIndex}_${section.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Section title with bookmark
        children.push(
            new Paragraph({
                children: [
                    new BookmarkStart({ id: sectionBookmarkId, name: sectionBookmarkId }),
                    new TextRun({
                        text: section.title,
                        size: 48 - (section.level * 8),
                        bold: true
                    }),
                    new BookmarkEnd({ id: sectionBookmarkId })
                ],
                heading: section.level === 1 ? HeadingLevel.HEADING_1 :
                        section.level === 2 ? HeadingLevel.HEADING_2 :
                        HeadingLevel.HEADING_3,
                spacing: { before: 240, after: 120 }
            })
        );
        
        // Section content
        if (section.content) {
            const contentParagraphs = section.content.split('\n\n');
            contentParagraphs.forEach(para => {
                if (para.trim()) {
                    children.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: para.trim(),
                                    size: 22
                                })
                            ],
                            spacing: { after: 120 }
                        })
                    );
                }
            });
        }
        
        // Process subsections
        if (section.subsections) {
            for (const [subIndex, subsection] of section.subsections.entries()) {
                const subBookmarkId = `toc_${sectionIndex}_${subIndex}_${subsection.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                children.push(
                    new Paragraph({
                        children: [
                            new BookmarkStart({ id: subBookmarkId, name: subBookmarkId }),
                            new TextRun({
                                text: subsection.title,
                                size: 32,
                                bold: true
                            }),
                            new BookmarkEnd({ id: subBookmarkId })
                        ],
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 200, after: 100 }
                    })
                );
                
                if (subsection.content) {
                    const subContentParagraphs = subsection.content.split('\n\n');
                    subContentParagraphs.forEach(para => {
                        if (para.trim()) {
                            children.push(
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: para.trim(),
                                            size: 22
                                        })
                                    ],
                                    spacing: { after: 120 }
                                })
                            );
                        }
                    });
                }
                
                // Add actual images
                if (subsection.images && subsection.images.length > 0) {
                    for (const imagePath of subsection.images) {
                        try {
                            const imageBuffer = processImageForWord(imagePath, section, subsection, documentData);
                            
                            if (imageBuffer) {
                                children.push(
                                    new Paragraph({
                                        children: [
                                            new ImageRun({
                                                data: imageBuffer,
                                                transformation: {
                                                    width: 400,
                                                    height: 300
                                                }
                                            })
                                        ],
                                        spacing: { before: 120, after: 120 }
                                    })
                                );
                            }
                        } catch (error) {
                            console.error(`Error adding image to Word document: ${imagePath}`, error);
                        }
                    }
                }
            }
        }
    }
    
    return children;
}