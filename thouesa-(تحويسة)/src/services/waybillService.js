const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');

async function generateWaybill(order, user) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const fileName = `waybill-${order.serial_number}.pdf`;
        const dirPath = path.join(process.cwd(), 'uploads', 'waybills');
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        const filePath = path.join(dirPath, fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc.fontSize(25).text('THOUESA - تحويسة', { align: 'center' });
        doc.fontSize(15).text('Shipping Waybill - بوليصة شحن', { align: 'center' });
        doc.moveDown();

        // Barcode
        bwipjs.toBuffer({
            bcid: 'code128',       // Barcode type
            text: order.serial_number,    // Text to encode
            scale: 3,               // 3x scaling factor
            height: 10,              // Bar height, in millimeters
            includetext: true,            // Show human-readable text
            textxalign: 'center',        // Always good to set this
        }, function (err, png) {
            if (err) {
                reject(err);
            } else {
                doc.image(png, 400, 100, { width: 150 });
                
                // Order Info
                doc.fontSize(12).text(`Serial Number: ${order.serial_number}`, 50, 120);
                doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`);
                doc.moveDown();

                // Sender Info
                doc.fontSize(14).text('Sender Information - معلومات المرسل', { underline: true });
                doc.fontSize(12).text(`Name: ${user.full_name}`);
                doc.text(`Phone: ${user.phone}`);
                doc.text(`Email: ${user.email || 'N/A'}`);
                doc.moveDown();

                // Recipient Info
                const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                doc.fontSize(14).text('Recipient Information - معلومات المستلم', { underline: true });
                if (order.type === 'parcel') {
                    doc.fontSize(12).text(`Name: ${items.recipient_name || 'N/A'}`);
                    doc.text(`Phone: ${items.recipient_phone || 'N/A'}`);
                    doc.text(`Address: ${items.recipient_addr || 'N/A'}`);
                } else if (order.type === 'buy') {
                    doc.fontSize(12).text(`Store: ${items.store_name || 'N/A'}`);
                    doc.text(`Product: ${items.product_desc || 'N/A'}`);
                    doc.text(`Price: ${items.approx_price || 'N/A'}`);
                } else {
                    doc.fontSize(12).text(`Country: ${items.global_country || 'N/A'}`);
                    doc.text(`Link: ${items.product_link || 'N/A'}`);
                    doc.text(`Specs: ${items.product_specs || 'N/A'}`);
                }
                doc.moveDown();

                // Shipment Details
                doc.fontSize(14).text('Shipment Details - تفاصيل الشحنة', { underline: true });
                doc.fontSize(12).text(`Type: ${order.type}`);
                doc.text(`Category: ${order.item_category || 'N/A'}`);
                doc.text(`Weight: ${order.weight} kg`);
                doc.text(`Declared Value: ${order.declared_value} JOD`);
                doc.moveDown();

                // Footer
                doc.fontSize(10).text('Thank you for choosing Thouesa!', { align: 'center', oblique: true });
                doc.text('شكراً لاختياركم تحويسة!', { align: 'center' });

                doc.end();
            }
        });

        stream.on('finish', () => {
            resolve(`/uploads/waybills/${fileName}`);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}

module.exports = { generateWaybill };
